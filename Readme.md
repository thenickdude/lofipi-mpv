# Lofipi-mpv

This runs as a system service on Raspberry Pi inside my "lofipi" speaker to automatically stream music from 
YouTube playlists on startup.

For full build instructions, see:

https://www.printables.com/model/176143-lofipi

For input, a tone knob and a pause/skip button are connected to GPIO.

A PWM fan connected by GPIO will have its speed set to 50% on startup
by default.

Check out the [default settings](default.conf), which you can override by copying that file to
`/etc/lofipi-mpv.conf` and editing them appropriately.

## Installing

Install me with:

```bash
sudo dpkg -i lofipi-mpv_1.0.0-0~bullseye0_armhf.deb
```

## Building

You can build me as a deb by:

```bash
sudo apt install debhelper nodejs npm
dpkg-buildpackage --build=binary -uc -us
```