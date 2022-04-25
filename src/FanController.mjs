import Hysteresis from "./Hysteresis.mjs";

const
    TEMP_POLL_INTERVAL = 2000,

    // Fan turns off if we drop to this temp:
    FAN_OFF_THRESHOLD_TEMP = 54.0,
    // Fan's initial state at power-up is set by this threshold:
    FAN_THRESHOLD_TEMP = 55.0,
    // Fan turns on if we climb to this temp:
    FAN_ON_THRESHOLD_TEMP = 60.0,

    LOW_SPEED_AT_TEMP = 55,
    HIGH_SPEED_AT_TEMP = 67;

export default class FanController {

    /**
     *
     * @param pio
     * @param {Number} initialSpeed
     * @param {?Number} lowSpeed
     * @param {?Number} highSpeed
     * @param {?TempSensor} tempSensor
     */
    constructor(pio, initialSpeed, lowSpeed, highSpeed, tempSensor) {
        this.pigpio = pio;

        this._initialSpeed = +initialSpeed;
        if (Number.isNaN(this._initialSpeed)) {
            this._initialSpeed = 1.0;
        }

        this._currentSpeed = null;

        this._lowSpeed = +lowSpeed;
        this._highSpeed = +highSpeed;
        this._tempSensor = tempSensor;
    }

    async start(fanPinNum) {
        this.fanGPIO = this.pigpio.gpio(fanPinNum);
        await this.fanGPIO.modeSet('output');

        /*
         * 25kHz is the ideal target for PC fans, but tested Noctua fans
         * will work way down into the hundreds, so we don't have to worry
         * that the Pi doesn't achieve this requested frequency (I only saw it hit 8kHz):
         */
        await this.fanGPIO.setPWMfrequency(25000);

        await this.setFanSpeed(this._initialSpeed);

        if (this._tempSensor && !Number.isNaN(this._lowSpeed) && !Number.isNaN(this._highSpeed)) {
            const
                startThreshold = new Hysteresis(FAN_OFF_THRESHOLD_TEMP, FAN_THRESHOLD_TEMP, FAN_ON_THRESHOLD_TEMP);

            const runSample = () => {
                this._tempSensor.sample()
                    .then(temp => {
                        if (temp === null) {
                            return;
                        }

                        startThreshold.addReading(temp);

                        if (startThreshold.isHigh) {
                            let
                                tempProportion = Math.min(Math.max((temp - LOW_SPEED_AT_TEMP) / (HIGH_SPEED_AT_TEMP - LOW_SPEED_AT_TEMP), 0.0), 1.0),
                                newSpeed = tempProportion * (this._highSpeed - this._lowSpeed) + this._lowSpeed;

                            // console.log(`temp ${temp} fanOn ${startThreshold.isHigh} newSpeed ${newSpeed}`);

                            this.setFanSpeed(newSpeed)
                        } else {
                            // console.log(`temp ${temp} fanOn ${startThreshold.isHigh} newSpeed off`);

                            this.setFanSpeed(0.0);
                        }
                    })
                    .then(() => setTimeout(runSample, TEMP_POLL_INTERVAL));
            };

            runSample();
        }
    }

    /**
     *
     * @param {Number} speed 0.0 - 1.0
     */
    async setFanSpeed(speed) {
        speed = Math.min(Math.max((+speed * 255), 0), 255);

        if (this._currentSpeed !== speed) {
            this._currentSpeed = speed;

            // Pin is inverted, so we invert the duty cycle too
            await this.fanGPIO.setPWMdutyCycle(255 - speed);
        }
    }

}