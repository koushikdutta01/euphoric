# Euphoric: Technical Documentation

Euphoric is a high-fidelity, bit-perfect audio player built with React Native and a custom-engineered C++ audio engine. It focuses on minimalist aesthetics and uncompromising audio quality.

## 🌟 Core Features

### 1. High-Fidelity Audio Engine
*   **Bit-Perfect Playback:** Uses the Android Oboe library for low-latency, high-performance audio.
*   **Native Decoders:** Built-in support for multiple formats using `dr_libs`:
    *   **FLAC:** Lossless audio decoding.
    *   **WAV:** Raw PCM support.
    *   **MP3:** Native MPEG-1 Layer III decoding (newly added).
*   **Direct Memory Access:** Decodes audio files directly into a PCM buffer in C++ to minimize overhead and jitter.

### 2. Intelligent Library Management
*   **Auto-Scanner:** Recursively scans device storage for audio assets using `expo-media-library`.
*   **Smart Grouping:** Automatically categorizes music into albums based on folder structure and metadata.
*   **Dynamic Metadata:** Extracts ID3 tags and embedded album art natively.

### 3. Responsive & Dynamic UI
*   **Adaptive Theming:** Uses `react-native-image-colors` to extract the dominant "vibrant" color from album art, updating the entire app's accent colors in real-time.
*   **Safe Area Architecture:** Integrated `react-native-safe-area-context` to ensure the "Bottom Capsule" UI never overlaps with system navigation bars or notches across different Android device configurations.
*   **Glassmorphism Aesthetic:** Utilizes `expo-blur` for a frosted-glass effect on control panels and library modals.

---

## 🏗️ Technical Architecture

The app is built using a "Hybrid Tri-Layer" architecture:

### Layer 1: The UI (React Native / JavaScript)
*   **Framework:** Expo (SDK 54+).
*   **State Management:** React Hooks (`useState`, `useEffect`, `useRef`).
*   **Animations:** `Animated` API for the breathing background effect and smooth transitions.

### Layer 2: The Bridge (Expo Modules / Kotlin)
*   **Module Name:** `euphoric-audio`.
*   **Responsibility:** Handles JNI (Java Native Interface) calls, manages the Android `MediaSession` (for lock-screen controls), and handles foreground service notifications.

### Layer 3: The Engine (C++ / Oboe)
*   **Core Engine:** `EuphoricAudioEngine.cpp`.
*   **Library:** [Oboe](https://github.com/google/oboe) by Google.
*   **Decoders:** Single-header C libraries (`dr_flac.h`, `dr_wav.h`, `dr_mp3.h`) for maximum portability and performance.

---

## 🛠️ Build Process

### Environment Requirements
*   **OS:** Fedora Linux 43.
*   **JDK:** OpenJDK 21 (required for React Native 0.81 compatibility).
*   **Android NDK:** Version 27.1.12297006.

### Release Build Pipeline
Standard Expo development builds run over a socket. Euphoric uses a standalone **Release Build** pipeline to embed the JavaScript bundle directly into the APK:

1.  **Dependency Alignment:** Ensures native modules are linked correctly via `npx expo prebuild`.
2.  **Native Compilation:** Compiles C++ code using CMake and Kotlin code via Gradle.
3.  **Bundle Injection:** Runs the Metro Bundler to generate `index.android.bundle` and injects it into the APK assets.
4.  **APK Generation:** Uses `./gradlew assembleRelease` to produce a standalone installer.

---

## 🚀 Future Roadmap
*   **Gapless Playback:** Implementing a double-buffer system in the C++ engine.
*   **10-Band EQ:** Native signal processing for custom frequency shaping.
*   **Playlist Support:** Persistence layer for user-defined collections.
