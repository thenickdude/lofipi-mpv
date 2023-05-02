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

        // LADSPA_Control defines "long words" in its file format, which are, more or less,
        // 32 bit on 32-bit OS and 64-bit on 64-bit OS, we need to match this:
        //
        // Linking against the alsaequal header file would be a much better solution to this guesswork
        this.longWords = ['arm64', 'ppc64', 'x64'].indexOf(process.arch) > -1;

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

        return 4 * (this.longWords ? 8 : 4) + 2 * 4 + NUM_BANDS * 72
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

        /*
            Header has this structure:

            typedef struct LADSPA_Control_ {
                unsigned long length;
                unsigned long id;
                unsigned long channels;
                unsigned long num_controls;
                int input_index;
                int output_index;
                LADSPA_Control_Data control[];
            }
         */

        let
            fileLen = this._calculateFileLength(),

            buffer = new ArrayBuffer(fileLen),

            head = this.longWords ? new BigUint64Array(buffer, 0, 4) : new Uint32Array(buffer, 0, 4),
            tail = new Uint32Array(buffer, head.byteLength, (fileLen - head.byteLength) / 4),

            cursor = 0;

        // First the variable-size words for the header:
        for (let entry of [
            fileLen,
            LADSPA_PLUGIN_EQ10, // Eq10 plugin's unique ID
            this.mono ? 1 : 2,  // Num channels
            NUM_BANDS,
        ]) {
            head[cursor++] = this.longWords ? BigInt(entry) : entry;
        }

        // Then the rest which are always 32-bit:
        cursor = 0;

        tail[cursor++] = NUM_BANDS;     // Input index
        tail[cursor++] = NUM_BANDS + 1; // Output index

        for (let i = 0; i < NUM_BANDS; i++) {
            tail[cursor++] = i; // Control index

            // Per-channel equaliser weights for the current band:
            for (let j = 0; j < NUM_CHANNELS; j++, cursor++) {
                if (j <= 1) {
                    // L and R channels:
                    tail[cursor] = floatToUint32(preset[i]);
                } else {
                    // Other channels can be zero:
                    tail[cursor] = ZEROFASINT;
                }
            }

            tail[cursor++] = LADSPA_CNTRL_OUTPUT; // Control type
        }

        fs.ftruncateSync(this.fd, fileLen); // Fix overlong files
        fs.writeSync(this.fd, Buffer.from(buffer), 0, fileLen, 0);
    }

}