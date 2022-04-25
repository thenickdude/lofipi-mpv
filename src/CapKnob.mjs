import fs from "fs";

function median(arr) {
    arr = arr.slice(0);

    arr.sort((a, b) => a - b);

    return arr[Math.floor(arr.length / 2)];
}

function average(arr) {
    return arr.reduce((acc, val) => acc + val, 0) / arr.length;
}

function setTimeoutPromise(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

const
    BOUNDS_CHANGE_THRESHOLD = 200;

/**
 * Implements ADC reading of a potentiometer, using a digital pin, by measuring time taken
 * to charge a capacitor through it.
 */
export default class CapKnob {

    constructor(pio, numSamples, onReading, persistFile = null) {
        this.min = -1;
        this.max = -1;
        this._savedMin = -1;
        this._savedMax = -1;
        this.reading = undefined;

        this.onReading = onReading;

        this.buffer = new Array(numSamples);
        this.bufferIndex = 0;

        this.pio = pio;

        this.debounceTimer = null;
        this.persistFile = persistFile;

        if (persistFile) {
            try {
                let
                    lines = fs.readFileSync(persistFile, "utf-8")
                        .split("\n")
                        .map(line => line.trim())
                        .filter(line => line.length > 0);

                this.min = parseInt(lines[0], 10);
                this.max = parseInt(lines[1], 10);

                if (Number.isNaN(this.min)) {
                    this.min = -1;
                }

                if (Number.isNaN(this.max)) {
                    this.max = -1;
                }

                console.log(`Restored knob limits ${this.min} ${this.max}`);
            } catch (e) {
                this.min = -1;
                this.max = -1;
            }
        }
    }

    async start(pinNumber) {
        let
            potGPIO,
            startTick;

        potGPIO = this.pio.gpio(pinNumber);
        await potGPIO.modeSet('output');
        await potGPIO.pullUpDown(0); // No pull-up

        let
            measure = () => {
                // Discharge the cap:
                Promise.all([
                    potGPIO.modeSet('output'),
                    potGPIO.write(0)
                ])
                    // Allow time to discharge (also serves to rate-limit our measurements)
                    .then(() => setTimeoutPromise(10))
                    .then(() => {
                        this.pio.getCurrentTick((err, tick) => {
                            // Go high-impedance to start the charge cycle
                            potGPIO.modeSet('input', () => {
                                startTick = tick;
                            });
                        });
                    });
            };

        potGPIO.notify((level, tick) => {
            if (level === 1 && startTick !== undefined) {
                let
                    endTick = tick,
                    elapsedTime = endTick - startTick;

                if (endTick > startTick) {
                    this.buffer[this.bufferIndex++] = elapsedTime;

                    if (this.bufferIndex >= this.buffer.length) {
                        let
                            m = median(this.buffer),
                            validValues;

                        // Use the median to adjust our min and max bounds
                        this.min = this.min === -1 ? m : Math.min(this.min, m);
                        this.max = this.max === -1 ? m : Math.max(this.max, m);

                        // Do we need to update the saved bounds?
                        if (!this.debounceTimer && this.persistFile && (Math.abs(this.min - this._savedMin) > BOUNDS_CHANGE_THRESHOLD
                                || Math.abs(this.max - this._savedMax) > BOUNDS_CHANGE_THRESHOLD)) {
                            // Coalesce multiple successive updates by only saving every 10 seconds at maximum
                            this.debounceTimer = setTimeout(() => {
                                fs.writeFileSync(this.persistFile, this.min + "\n" + this.max);
                                this._savedMin = this.min;
                                this._savedMax = this.max;
                                this.debounceTimer = null;
                            }, 10000);
                        }

                        // Only average values that lie within our bounds
                        validValues = this.buffer.filter(x => x >= this.min && x <= this.max);

                        if (validValues.length > 0) {
                            this.reading = average(validValues);

                            // Avoid reporting NaNs from division by zero:
                            if (this.max > this.min) {
                                this.onReading((this.reading - this.min) / (this.max - this.min));
                            }
                        }

                        this.bufferIndex = 0;
                    }
                }

                startTick = undefined;
                measure();
            }
        });

        await measure();
    }
}