#include <jni.h>
#include "EuphoricAudioEngine.h"

static EuphoricAudioEngine *engine = nullptr;

extern "C" {

JNIEXPORT void JNICALL
Java_expo_modules_euphoricaudio_EuphoricAudioModule_nativeStartAudio(JNIEnv *env, jobject thiz) {
    if (engine == nullptr) {
        engine = new EuphoricAudioEngine();
    }
    engine->start();
}

JNIEXPORT void JNICALL
Java_expo_modules_euphoricaudio_EuphoricAudioModule_nativeStopAudio(JNIEnv *env, jobject thiz) {
    if (engine != nullptr) {
        engine->stop();
    }
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_euphoricaudio_EuphoricAudioModule_nativeLoadAudio(JNIEnv *env, jobject thiz, jstring file_path) {
    if (engine == nullptr) {
        engine = new EuphoricAudioEngine();
    }
    const char *path = env->GetStringUTFChars(file_path, nullptr);
    bool result = engine->loadAudio(path);
    env->ReleaseStringUTFChars(file_path, path);
    return result;
}

JNIEXPORT void JNICALL
Java_expo_modules_euphoricaudio_EuphoricAudioModule_nativeSeekTo(JNIEnv *env, jobject thiz, jdouble seconds) {
    if (engine != nullptr) {
        engine->seekTo(seconds);
    }
}

JNIEXPORT jdouble JNICALL
Java_expo_modules_euphoricaudio_EuphoricAudioModule_nativeGetPosition(JNIEnv *env, jobject thiz) {
    return (engine != nullptr) ? engine->getCurrentPosition() : 0.0;
}

JNIEXPORT jdouble JNICALL
Java_expo_modules_euphoricaudio_EuphoricAudioModule_nativeGetDuration(JNIEnv *env, jobject thiz) {
    return (engine != nullptr) ? engine->getTotalDuration() : 0.0;
}

JNIEXPORT jint JNICALL
Java_expo_modules_euphoricaudio_EuphoricAudioModule_nativeGetSampleRate(JNIEnv *env, jobject thiz) {
    return (engine != nullptr) ? engine->getSampleRate() : 0;
}

}
