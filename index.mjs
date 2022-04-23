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
    const
        pio = pigpio({
            timeout: 60
        });

    await new Promise((resolve, reject) => {
        pio.once('connected', resolve);
        pio.once('error', reject);
    });

    const
        fanController = new FanController(pio),

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
                console.log("Play/pause");
                mpvPlayer.togglePause();
            }
        });

    if (config.fan_pin) {
        await fanController.start(config.fan_pin | 0, (+config.fan_speed) * 255);
    }
    if (config.tone_knob_pin) {
        await toneKnob.start(config.tone_knob_pin | 0);
    }

    if (config.play_skip_pin) {
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

    await mpvPlayer.command("loadfile", [config.play_url]);

    await mpvPlayer.play();
}

initEqualizer();

startMPV()
    .then(
        () => startGPIO(mpvPlayer)
            .catch(e => {
                console.error("Failed to start GPIO with pigpio: " + e);
                console.error("Assuming that this is a system without GPIO, and continuing...");
            })
    )
    .catch(e => console.error(e));
