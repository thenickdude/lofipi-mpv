const
    POLL_INTERVAL = 10, // msec
    POLL_SAMPLES = 5,

    PULL_UP = 2,

    BUTTON_PRESSED_LEVEL = 0, // Since button shorts to GND
    BUTTON_UNPRESSED_LEVEL = 1;

export default class Button {

    constructor(pio, longPressDuration, onPress) {
        this.pio = pio;

        this.pressStart = undefined;

        this.longPressDuration = longPressDuration * 1000;
        this.shortPressDuration = 100 * 1000;
        this.onPress = onPress;
    }

    async start(buttonPin) {
        let
            buttonGPIO = this.pio.gpio(buttonPin);

        await buttonGPIO.modeSet('input');
        await buttonGPIO.pullUpDown(PULL_UP);

        buttonGPIO.notify((level, tick) => {
            if (level === BUTTON_PRESSED_LEVEL && this.pressStart === undefined) {
                this.pressStart = tick;

                let
                    readings = new Array(POLL_SAMPLES),
                    readingIndex = 0,

                    pollForRelease = () => {
                        buttonGPIO.read((err, reading) => {
                            readings[readingIndex++] = reading;

                            // If we've read a full sample window worth...
                            if (readingIndex === readings.length) {
                                let
                                    // Wait for a fully-up window
                                    buttonUp = readings.filter(val => val === BUTTON_UNPRESSED_LEVEL).length === readings.length;

                                if (buttonUp) {
                                    // Reset and start waiting for the next press:
                                    this.pressStart = undefined;
                                } else {
                                    // Wait for button to be released:
                                    readingIndex = 0;
                                    setTimeout(pollForRelease, POLL_INTERVAL);
                                }
                            } else {
                                // Keep polling until the sample window is filled
                                setTimeout(pollForRelease, POLL_INTERVAL);
                            }
                        });
                    },

                    pollForPress = () => {
                        buttonGPIO.read((err, reading) => {
                            readings[readingIndex++] = reading;

                            // If we've read a full sample window worth...
                            if (readingIndex === readings.length) {
                                let
                                    // Button is down if more than half the readings in the window are down
                                    buttonDown = readings.filter(val => val === BUTTON_PRESSED_LEVEL).length > readings.length / 2;

                                readingIndex = 0;

                                this.pio.getCurrentTick((err, tick) => {
                                    let
                                        pressDuration = tick - this.pressStart;

                                    if (buttonDown) {
                                        if (pressDuration >= this.longPressDuration) {
                                            this.onPress(true);

                                            // Wait for button release
                                            setTimeout(pollForRelease, POLL_INTERVAL);
                                        } else {
                                            // Start a new listening window to wait for the button to be released
                                            setTimeout(pollForPress, POLL_INTERVAL);
                                        }
                                    } else {
                                        if (pressDuration >= this.shortPressDuration) {
                                            this.onPress(false);
                                        }

                                        // Start waiting for the next press:
                                        this.pressStart = undefined;
                                    }
                                });
                            } else {
                                // Keep polling until the sample window is filled
                                setTimeout(pollForPress, POLL_INTERVAL);
                            }
                        });
                    };

                pollForPress();
            }
        });
    }

}