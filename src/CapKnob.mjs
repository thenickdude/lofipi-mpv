import assert from "assert";
import {setTimeout} from "timers/promises";

import {pigpio} from "pigpio-client";

function median(arr) {
    arr = arr.slice(0);

    arr.sort((a, b) => a - b);

    return arr[Math.floor(arr.length / 2)];
}

function average(arr) {
    return arr.reduce((acc, val) => acc + val, 0) / arr.length;
}

/**
 * Implements ADC reading of a potentiometer, using a digital pin, by measuring time taken
 * to charge a capacitor through it.
 */
export default class CapKnob {

    constructor(pio, numSamples, onReading) {
        this.min = -1;
        this.max = -1;
        this.reading = undefined;

        this.onReading = onReading;

        this.buffer = new Array(numSamples);
        this.bufferIndex = 0;

        this.pio = pio;
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
                    .then(() => setTimeout(10))
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