#include "EuphoricAudioEngine.h"
#include <android/log.h>
#include <cmath>
#include <algorithm>
#include <cstring>

#define DR_WAV_IMPLEMENTATION
#include "dr_wav.h"
#define DR_FLAC_IMPLEMENTATION
#include "dr_flac.h"

#define LOG_TAG "EuphoricAudioEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

EuphoricAudioEngine::EuphoricAudioEngine() {}

EuphoricAudioEngine::~EuphoricAudioEngine() {
    stop();
}

void EuphoricAudioEngine::setVolume(float volume) {
    mTargetVolume = std::clamp(volume, 0.0f, 1.0f);
}

void EuphoricAudioEngine::seekTo(double seconds) {
    if (!mIsLoaded) return;
    size_t targetIndex = static_cast<size_t>(seconds * mSampleRate * mChannelCount);
    targetIndex = std::min(targetIndex, mAudioBuffer.size());
    // Align to channel boundary
    targetIndex = (targetIndex / mChannelCount) * mChannelCount;
    mReadIndex.store(targetIndex);
}

double EuphoricAudioEngine::getCurrentPosition() {
    if (mSampleRate == 0 || mChannelCount == 0) return 0.0;
    return static_cast<double>(mReadIndex.load()) / (mSampleRate * mChannelCount);
}

double EuphoricAudioEngine::getTotalDuration() {
    if (mSampleRate == 0 || mChannelCount == 0) return 0.0;
    return static_cast<double>(mAudioBuffer.size()) / (mSampleRate * mChannelCount);
}

bool EuphoricAudioEngine::loadAudio(const char* filePath) {
    LOGI("Loading audio: %s", filePath);
    
    mCurrentVolume = 0.0f;

    bool wasRunning = false;
    if (mStream && mStream->getState() == oboe::StreamState::Started) {
        mStream->requestStop();
        wasRunning = true;
    }

    mIsLoaded = false;
    mAudioBuffer.clear();
    mReadIndex = 0;

    unsigned int channels;
    unsigned int sampleRate;
    drwav_uint64 totalFrameCount;

    float* pWavData = drwav_open_file_and_read_pcm_frames_f32(filePath, &channels, &sampleRate, &totalFrameCount, NULL);
    if (pWavData != NULL) {
        LOGI("WAV decoded: %d channels, %d Hz, %llu frames", channels, sampleRate, totalFrameCount);
        mAudioBuffer.assign(pWavData, pWavData + (totalFrameCount * channels));
        drwav_free(pWavData, NULL);
    } else {
        drflac_uint64 flacFrameCount;
        float* pFlacData = drflac_open_file_and_read_pcm_frames_f32(filePath, &channels, &sampleRate, &flacFrameCount, NULL);
        if (pFlacData != NULL) {
            LOGI("FLAC decoded: %d channels, %d Hz, %llu frames", channels, sampleRate, flacFrameCount);
            mAudioBuffer.assign(pFlacData, pFlacData + (flacFrameCount * channels));
            drflac_free(pFlacData, NULL);
        } else {
            LOGE("Failed to decode audio file");
            return false;
        }
    }

    mChannelCount = channels;
    mSampleRate = sampleRate;
    mIsLoaded = true;

    resetStream();

    if (wasRunning) {
        start();
    }

    return true;
}

void EuphoricAudioEngine::resetStream() {
    if (mStream) {
        mStream->stop();
        mStream->close();
        mStream.reset();
    }
}

bool EuphoricAudioEngine::start() {
    if (!mIsLoaded) {
        LOGE("No audio file loaded");
        return false;
    }

    oboe::AudioStreamBuilder builder;
    builder.setCallback(this)
        ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
        ->setSharingMode(oboe::SharingMode::Exclusive)
        ->setFormat(oboe::AudioFormat::Float)
        ->setChannelCount(mChannelCount)
        ->setSampleRate(mSampleRate);

    oboe::Result result = builder.openStream(mStream);
    if (result != oboe::Result::OK) {
        LOGE("Error opening stream: %s", oboe::convertToText(result));
        return false;
    }

    result = mStream->requestStart();
    if (result != oboe::Result::OK) {
        LOGE("Error starting stream: %s", oboe::convertToText(result));
        return false;
    }

    LOGI("Stream started successfully at %d Hz", mSampleRate);
    return true;
}

void EuphoricAudioEngine::stop() {
    if (mStream) {
        mStream->stop();
        mStream->close();
        mStream.reset();
        LOGI("Stream stopped and closed");
    }
}

oboe::DataCallbackResult EuphoricAudioEngine::onAudioReady(
        oboe::AudioStream *audioStream,
        void *audioData,
        int32_t numFrames) {

    auto *outputData = static_cast<float *>(audioData);
    size_t framesToRead = numFrames;
    size_t samplesToRead = framesToRead * mChannelCount;
    
    size_t currentIndex = mReadIndex.load();
    size_t availableSamples = mAudioBuffer.size() - currentIndex;
    
    if (availableSamples == 0 || !mIsLoaded) {
        std::memset(outputData, 0, samplesToRead * sizeof(float));
        return oboe::DataCallbackResult::Continue;
    }

    size_t actualSamples = std::min(samplesToRead, availableSamples);
    
    float targetVol = mTargetVolume.load();
    float currentVol = mCurrentVolume.load();
    
    for (int i = 0; i < actualSamples; ++i) {
        if (std::abs(currentVol - targetVol) > kVolumeIncrement) {
            if (currentVol < targetVol) currentVol += kVolumeIncrement / mChannelCount;
            else currentVol -= kVolumeIncrement / mChannelCount;
        } else {
            currentVol = targetVol;
        }
        
        outputData[i] = mAudioBuffer[currentIndex + i] * currentVol;
    }
    
    mCurrentVolume.store(currentVol);

    if (actualSamples < samplesToRead) {
        std::memset(outputData + actualSamples, 0, (samplesToRead - actualSamples) * sizeof(float));
        // mReadIndex.store(0); // For now, don't loop automatically, let UI handle it
    } else {
        mReadIndex.store(currentIndex + actualSamples);
    }

    return oboe::DataCallbackResult::Continue;
}
