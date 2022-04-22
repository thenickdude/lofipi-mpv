# Lofipi-mpv

This runs as a system service on Raspberry Pi to automatically stream music from YouTube playlists on startup.

For input, a tone knob and a pause/skip button are connected to GPIO.

A PWM fan connected by GPIO will have its speed set to 50% on startup
by default.

Check out the [default settings](default.conf), which you can override by copying that file to
`/etc/lofipi-mpv.conf` and editing them appropriately.

## Building 

Build me as a deb with:

```bash
dpkg-buildpackage --build=binary -uc -us
```

