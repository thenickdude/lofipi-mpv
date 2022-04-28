import fs from "fs";
import path from "path";
import assert from "assert";

import {pigpio} from "pigpio-client";
import mpv from "node-mpv";
import ini from "ini";

import Equalizer from "./src/Equalizer.mjs";
import FanController from "./src/FanController.mjs";
import CapKnob from "./src/CapKnob.mjs";
import Button from "./src/Button.mjs";
import TempSensor from "./src/TempSensor.mjs";

const
    RUNTIME_DIRECTORY = process.env.RUNTIME_DIRECTORY,
    STATE_DIRECTORY = process.env.STATE_DIRECTORY,
    CONFIG_FILE = process.env.CONFIG_FILE;

let
    config = ini.parse(fs.readFileSync("default.conf", 'utf-8'));

if (CONFIG_FILE && fs.existsSync(process.env.CONFIG_FILE)) {
    config = {...config, ...ini.parse(fs.readFileSync(process.env.CONFIG_FILE, 'utf-8'))};
}

const
    shuffle = config.shuffle | 0,

    eqPresets = [
        Array(Equalizer.NUM_BANDS).fill(0),
        Array(Equalizer.NUM_BANDS).fill(0)
    ],

    mpvPlayer = new mpv({
        audio_only: true
    }, ["--audio-device=alsa"].concat(...shuffle ? ["--shuffle"] : []));

let
    equalizer;

function lerpIntArrays(a, b, prop) {
    assert(a.length === b.length);

    let
        result = new Array(a.length);

    for (let i = 0; i < a.length; i++) {
        result[i] = Math.round(a[i] * (1 - prop) + b[i] * prop);
    }

    return result;
}

async function startGPIO(mpvPlayer) {
    let
        pio = pigpio({
            timeout: 60
        }),

        paused = false;

    await new Promise((resolve, reject) => {
        pio.once('connected', resolve);
        pio.once('error', reject);
    });

    const
        cpuTemperature = new TempSensor(),

        fanController = new FanController(pio, +config.fan_speed, +config.fan_low_speed, +config.fan_high_speed, cpuTemperature),

        toneKnob = new CapKnob(
            pio,
            20,
            reading => {
                let
                    // Clip the bottom and top 10% off the range to make it easy to reach the limits
                    clippedReading = Math.min(Math.max((reading - 0.1) / 0.8, 0.0), 1.0);

                equalizer.loadPreset(lerpIntArrays(eqPresets[0], eqPresets[1], clippedReading));
            },
            STATE_DIRECTORY && fs.existsSync(STATE_DIRECTORY) ? path.join(STATE_DIRECTORY, "tone-limits") : null
        ),

        playSkip = new Button(pio, 400, longPress => {
            if (longPress) {
                console.log("Skip");
                mpvPlayer.next();
            } else {
                if (paused) {
                    console.log("Resume");
                    mpvPlayer.resume();
                    toneKnob.resume();
                    paused = false;
                } else {
                    console.log("Pause");
                    mpvPlayer.pause();
                    // Reduce idle CPU usage by not polling tone knob while paused:
                    toneKnob.pause();
                    paused = true;
                }
            }
        });

    if (config.fan_pin && config.fan_pin.trim().length > 0) {
        await fanController.start(config.fan_pin | 0, +config.fan_speed);
    }

    if (config.tone_knob_pin && config.tone_knob_pin.trim().length > 0) {
        await toneKnob.start(config.tone_knob_pin | 0);
    }

    if (config.play_skip_pin && config.play_skip_pin.trim().length > 0) {
        await playSkip.start(config.play_skip_pin | 0);
    }
}

function initEqualizer() {
    /*
     * The alsa equalizer plugin opens the file using mmap with write permissions, so we have
     * to put it in the runtime directory
     */
    equalizer = new Equalizer(RUNTIME_DIRECTORY && fs.existsSync(RUNTIME_DIRECTORY) ? path.join(RUNTIME_DIRECTORY, ".alsaequal.bin") : null, true);

    // Load EQ presets from config file
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < Equalizer.NUM_BANDS; j++) {
            eqPresets[i][j] = config[`eq_${i}_${j}`] | 0;
        }
    }

    equalizer.loadPreset(lerpIntArrays(eqPresets[0], eqPresets[1], +config.eq_default));
}

async function startMPV() {
    await mpvPlayer.start();

    mpvPlayer.on("status", s => {
        switch (s.property) {
            case "media-title":
                console.log(`Title: ${s.value}`)
                break;
            case "path":
                console.log(`URL: ${s.value}`);
                break;
        }
    })

    await mpvPlayer.loopPlaylist("inf");

    await mpvPlayer.command("loadfile", [config.play_url]);

    await mpvPlayer.play();
}

initEqualizer();

startGPIO(mpvPlayer)
    .catch(e => {
        console.error("Failed to start GPIO with pigpio: " + e);
        console.error("Assuming that this is a system without GPIO, and continuing...");
    })
    .then(() => {
        if (config.play_url.length > 0) {
            return startMPV()
        }
    })
    .catch(e => console.error(e));
