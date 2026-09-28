# Linux installation and AppImage sandboxing

On Ubuntu 24.04, prefer the official **Debian package (`.deb`)** and install it with the system package installer. The package includes an application-specific AppArmor profile, which its installation scripts load on supported systems. It must be installed, rather than merely unpacked, for those installation steps to run.

The AppImage remains a portable option on hosts that allow Chromium to create its sandbox. Standard Ubuntu 22.04 does not need the AppArmor setup below. Ubuntu 24.04 restricts unprivileged user namespaces by default, so its AppImage requires the one-time administrator setup below. Administrators may apply additional restrictions, and other distributions are not covered by this guide. See the [acceptance record](appimage-acceptance.md) for the actual builds and environments tested.

CF Compass does not automatically disable Chromium's sandbox when a host denies its prerequisites. A message about an incorrectly configured `chrome-sandbox` helper can be the consequence of user namespace access being denied; it does not mean that the temporary AppImage mount should be made root-owned or SUID.

## Ubuntu 24.04: authorize the fixed AppImage installation

This procedure grants user namespace permission only through a profile attached to the installed CF Compass AppImage path. The profile is an application-specific authorization exception, **not a complete AppArmor confinement policy**. It can be inherited by the application's child processes. It preserves Chromium's own sandbox and does not disable the system-wide AppArmor restriction.

An administrator should review this exception. Keep both the installed file and its directory owned by root and not writable by ordinary users: AppArmor matches the path, not a signature or hash of the file. Use `/opt/cf-compass` only for this installation. If that directory or the profile below already belongs to another managed installation, have its administrator reconcile the configuration first.

1. Download the official AppImage from [CF Compass Releases](https://github.com/Binah-Dev/cf-compass/releases), check its origin and available integrity information, and install it at the fixed path. Replace `VERSION` with the downloaded version and run these commands from its download directory:

   ```bash
   sudo install -d -o root -g root -m 0755 /opt/cf-compass
   sudo install -o root -g root -m 0755 -- ./CF-Compass-VERSION-x86_64.AppImage /opt/cf-compass/CF-Compass.AppImage
   ```

2. Open the application-specific profile for review:

   ```bash
   sudoedit /etc/apparmor.d/cf-compass-appimage
   ```

   Use this content, with the same exact installation path:

   ```text
   # CF Compass: application-specific user namespace permission.
   # This is an authorization exception, not full AppArmor confinement.
   abi <abi/4.0>,
   include <tunables/global>

   profile cf-compass-appimage "/opt/cf-compass/CF-Compass.AppImage" flags=(unconfined) {
     userns,
   }
   ```

3. Check the profile's syntax, then load it:

   ```bash
   sudo apparmor_parser --skip-kernel-load /etc/apparmor.d/cf-compass-appimage
   sudo apparmor_parser --replace /etc/apparmor.d/cf-compass-appimage
   ```

   Stop and investigate any error from either command. This does not require changing a global sysctl setting or disabling AppArmor. The file in `/etc/apparmor.d` is also available for AppArmor to load on subsequent boots.

4. Launch the installed AppImage as your ordinary desktop user, without `sudo`:

   ```bash
   /opt/cf-compass/CF-Compass.AppImage
   ```

   Point any desktop shortcut at this same path. A different downloaded copy or a manually extracted executable is not covered by this exact attachment.

Normal AppImage execution still needs a working FUSE device and mount helper. If FUSE is unavailable, the same authorized AppImage can use extraction mode:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 /opt/cf-compass/CF-Compass.AppImage
```

Extraction handles a FUSE limitation; it does not remove the sandbox's user namespace requirement. If either launch mode still fails, retain its terminal error and report the Ubuntu/kernel version and installation path. The value of `kernel.apparmor_restrict_unprivileged_userns` alone, or a generic `unshare` probe outside the application, does not show whether the application's profile is active.

## Updates and removal of the exception

The fixed AppImage is root-owned, so an ordinary AppImageUpdate process cannot overwrite it. Download or update the AppImage in a directory owned by your normal user, check the resulting release and its integrity, close CF Compass, then have the administrator repeat the `install` command above with the updated file. The unchanged installation path keeps the existing profile attachment. **Do not run the graphical updater as root or make the installed directory writable by ordinary users.** CF Compass does not add an automatic updater through this setup.

To withdraw the exception, close CF Compass and remove only the profile created by this procedure. Preserve any administrator customizations first:

```bash
sudo apparmor_parser --remove /etc/apparmor.d/cf-compass-appimage
sudo rm -- /etc/apparmor.d/cf-compass-appimage
```

Removing this exception does not delete application data. On a restricted Ubuntu 24.04 host, the AppImage may then refuse to start again until an appropriate application-specific authorization is restored.

## Profile generation for maintainers

Ordinary users do not need Node.js for the setup above. Maintainers and CI can generate the same profile with:

```bash
node scripts/appimage-apparmor.mjs /opt/cf-compass/CF-Compass.AppImage ./cf-compass-appimage.profile
node --test scripts/test-appimage-apparmor.mjs
```

The generator requires an exact absolute Linux path ending in `.AppImage`; it rejects wildcard syntax, quotes, control characters and noncanonical paths. It only creates the requested output file and refuses to overwrite an existing file. It does not install or load policy, request administrator rights, change sysctls, or verify that the named application exists or is trusted. Linux release acceptance must separately verify the installed profile, unchanged host restrictions, actual sandbox state, and both launch modes.

References: [Ubuntu 24.04 user namespace restrictions](https://documentation.ubuntu.com/release-notes/24.04/#unprivileged-user-namespace-restrictions), [Ubuntu's explanation of the authorization tradeoff](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007), [Electron process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox), and [AppImage sandbox prerequisites](https://docs.appimage.org/user-guide/troubleshooting/electron-sandboxing.html).
