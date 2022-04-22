import assert from "assert";
import fs from "fs";

const
    HEADER_LEN_WORDS = 6,

    NUM_BANDS = 10,
    NUM_CHANNELS = 16,

    LADSPA_PLUGIN_EQ10 = 1773,

    LADSPA_CNTRL_OUTPUT = 0,
    LADSPA_CNTRL_INPUT = 1,

    ZEROFASINT = floatToUint32(0.0);

function floatToUint32(f) {
    let
        buffer = new ArrayBuffer(4),

        asFloat = new Float32Array(buffer, 0, 1),
        asInt = new Uint32Array(buffer, 0, 1);

    asFloat[0] = f;

    return asInt[0];
}

/**
 * Equalizer control for EQ Caps LADSPA plugin
 */
export default class Equalizer {

    /**
     * @type {boolean}
     */
    mono;

    static NUM_BANDS = NUM_BANDS;

    /**
     * @param {?String} controlFilename - Filename of alsaequals control file, null to disable the equalizer
     * @param {boolean} mono
     */
    constructor(controlFilename, mono) {
        this.mono = mono;
        this.fd = null;

        if (controlFilename) {
            try {
                this.fd = fs.openSync(controlFilename, "w");
            } catch (e) {
                console.error(e);
                return;
            }

            this.loadPreset(new Array(NUM_BANDS).fill(0));
        }
    }

    _calculateFileLength() {
        let
            numChannels = this.mono ? 1 : 2;

        return 24 + NUM_BANDS * 72
            // alsaequals includes these bonus bytes in its length calculation, apparently erroneously,
            // because it never initialises them. But we have to match it for it to use the file:
            + numChannels * NUM_BANDS * 4;
    }

    /**
     *
     * @param {float[10]} preset
     */
    loadPreset(preset) {
        if (!this.fd) {
            return;
        }

        assert(preset && preset.length === NUM_BANDS);

        let
            fileLen = this._calculateFileLength(),
            buffer = new Uint32Array(fileLen / 4);

        buffer[0] = fileLen;
        buffer[1] = LADSPA_PLUGIN_EQ10; // Eq10 plugin's unique ID
        buffer[2] = this.mono ? 1 : 2; // Num channels
        buffer[3] = NUM_BANDS;
        buffer[4] = NUM_BANDS; // Input index
        buffer[5] = NUM_BANDS + 1; // Output index

        let
            cursor = HEADER_LEN_WORDS;

        for (let i = 0; i < NUM_BANDS; i++) {
            buffer[cursor++] = i; // Control index

            // Per-channel equaliser weights for the current band:
            for (let j = 0; j < NUM_CHANNELS; j++, cursor++) {
                if (j <= 1) {
                    // L and R channels:
                    buffer[cursor] = floatToUint32(preset[i]);
                } else {
                    // Other channels can be zero:
                    buffer[cursor] = ZEROFASINT;
                }
            }

            buffer[cursor++] = LADSPA_CNTRL_OUTPUT; // Control type
        }

        fs.ftruncateSync(this.fd, fileLen); // Fix overlong files
        fs.writeSync(this.fd, buffer, 0, fileLen, 0);
    }

}