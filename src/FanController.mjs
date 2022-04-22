export default class FanController {

    constructor(pio) {
        this.pigpio = pio;
    }

    async start(fanPinNum, speed) {
        this.fanGPIO = this.pigpio.gpio(fanPinNum);
        await this.fanGPIO.modeSet('output');

        /*
         * 25kHz is the ideal target for PC fans, but tested Noctua fans
         * will work way down into the hundreds:
         */
        await this.fanGPIO.setPWMfrequency(25000);

        return this.setFanSpeed(speed);
    }

    /**
     *
     * @param {int} speed 0 - 255
     */
    async setFanSpeed(speed) {
        speed = Math.min(Math.max(speed | 0, 0), 255);

        // Pin is inverted, so we invert the duty cycle too
        await this.fanGPIO.setPWMdutyCycle(255 - speed);
    }

}