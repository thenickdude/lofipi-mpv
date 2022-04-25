export default class Hysteresis {

    /**
     *
     * @param fallBound - A high value goes low when it falls below this threshold
     * @param threshold - Value is high if it is above this threshold
     * @param climbBound - A low value goes high when it climbs above this threshold
     * @param {?Function} onChange - Callback for when high state changes (also called upon initial state)
     */
    constructor(fallBound, threshold, climbBound, onChange= null) {
        this.threshold = threshold;
        this.fallBound = fallBound;
        this.climbBound = climbBound;

        this.isHigh = null;
        this.onChange = onChange;
    }

    _setHigh(high) {
        if (this.isHigh !== high) {
            this.isHigh = high;

            if (this.onChange) {
                this.onChange(this.reading, this.isHigh);
            }
        }
    }

    addReading(reading) {
        this.reading = reading;

        switch (this.isHigh) {
            case null:
                this._setHigh(this.reading >= this.threshold);
                break;
            case true:
                if (this.reading < this.fallBound) {
                    this._setHigh(false);
                }
                break;
            case false:
                if (this.reading > this.climbBound) {
                    this._setHigh(true);
                }
                break;
        }
    }
}