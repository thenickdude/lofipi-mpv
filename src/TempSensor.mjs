import fs from "fs";

/**
 * System temperature measurement
 */
export default class TempSensor {

    constructor() {
    }

    /**
     * Read temperature in degrees
     *
     * @return {Promise<Number>} Temperature in degrees, or null if temp could not be read
     */
    sample() {
        return new Promise(resolve => {
            fs.readFile("/sys/class/thermal/thermal_zone0/temp", {encoding: 'utf8', flag: 'r'}, (err, data) => {
                if (err) {
                    return resolve(null);
                }

                let
                    temp = parseInt(data, 10);

                if (Number.isNaN(temp)) {
                    resolve(null);
                } else {
                    resolve(temp / 1000.0);
                }
            });
        });
    }
}