# Euphoric Android Build Instructions

To build and install the standalone (Release) APK on your connected Android device:

## Prerequisites
1. Connect device via USB with Debugging enabled.
2. Ensure `adb devices` shows your device.

## Build & Install Command
Run this from the `euphoric/` directory:

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk && ./android/gradlew assembleRelease -p android && adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Why Release Build?
The standard `npx expo run:android` creates a development build that requires a cable and a running development server. This release build embeds the JavaScript bundle into the APK, allowing the app to work independently after the cable is disconnected.
