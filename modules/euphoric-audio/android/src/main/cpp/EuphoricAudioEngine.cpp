#include "EuphoricAudioEngine.h"
#include <android/log.h>
#include <cmath>
#include <algorithm>
#include <cstring>
#include <mutex>

#define DR_WAV_IMPLEMENTATION
#include "dr_wav.h"
#define DR_FLAC_IMPLEMENTATION
#include "dr_flac.h"
#define DR_MP3_IMPLEMENTATION
#include "dr_mp3.h"

#define LOG_TAG "EuphoricAudioEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

EuphoricAudioEngine::EuphoricAudioEngine() {}

EuphoricAudioEngine::~EuphoricAudioEngine() {
    stop();
}

void EuphoricAudioEngine::setVolume(float volume) {
    mTargetVolume.store(std::clamp(volume, 0.0f, 1.0f), std::memory_order_relaxed);
}

void EuphoricAudioEngine::seekTo(double seconds) {
    std::lock_guard<std::mutex> lock(mLock);
    if (!mIsLoaded) return;
    
    // Calculate index based on source format
    size_t targetIndex = static_cast<size_t>(seconds * mSampleRate * mSourceChannelCount);
    
    // Align to source channel boundary
    targetIndex = (targetIndex / mSourceChannelCount) * mSourceChannelCount;
    targetIndex = std::min(targetIndex, mAudioBuffer.size());
    
    mReadIndex.store(targetIndex);
    LOGI("Seek to %.2f seconds (Index: %zu)", seconds, targetIndex);
}

double EuphoricAudioEngine::getCurrentPosition() {
    if (mSampleRate == 0 || mSourceChannelCount == 0) return 0.0;
    return static_cast<double>(mReadIndex.load()) / (mSampleRate * mSourceChannelCount);
}

double EuphoricAudioEngine::getTotalDuration() {
    if (mSampleRate == 0 || mSourceChannelCount == 0) return 0.0;
    return static_cast<double>(mAudioBuffer.size()) / (mSampleRate * mSourceChannelCount);
}

bool EuphoricAudioEngine::loadAudio(const char* filePath) {
    std::lock_guard<std::mutex> lock(mLock);
    LOGI("Loading audio: %s", filePath);
    
    mCurrentVolume = 0.0f;

    // Stop current stream synchronously to prevent callbacks while clearing buffer
    if (mStream) {
        mStream->stop();
        mStream->close();
        mStream.reset();
    }

    mIsLoaded = false;
    mAudioBuffer.clear();
    mReadIndex = 0;

    unsigned int channels;
    unsigned int sampleRate;
    
    bool decoded = false;
    
    // WAV
    drwav_uint64 wavFrameCount;
    float* pWavData = drwav_open_file_and_read_pcm_frames_f32(filePath, &channels, &sampleRate, &wavFrameCount, NULL);
    if (pWavData != NULL) {
        LOGI("WAV decoded: %d channels, %d Hz, %llu frames", channels, sampleRate, wavFrameCount);
        mAudioBuffer.assign(pWavData, pWavData + (wavFrameCount * channels));
        drwav_free(pWavData, NULL);
        decoded = true;
    } else {
        // FLAC
        drflac_uint64 flacFrameCount;
        float* pFlacData = drflac_open_file_and_read_pcm_frames_f32(filePath, &channels, &sampleRate, &flacFrameCount, NULL);
        if (pFlacData != NULL) {
            LOGI("FLAC decoded: %d channels, %d Hz, %llu frames", channels, sampleRate, flacFrameCount);
            mAudioBuffer.assign(pFlacData, pFlacData + (flacFrameCount * channels));
            drflac_free(pFlacData, NULL);
            decoded = true;
        } else {
            // MP3
            drmp3_uint64 mp3FrameCount;
            drmp3_config mp3Config;
            float* pMp3Data = drmp3_open_file_and_read_pcm_frames_f32(filePath, &mp3Config, &mp3FrameCount, NULL);
            if (pMp3Data != NULL) {
                channels = mp3Config.channels;
                sampleRate = mp3Config.sampleRate;
                LOGI("MP3 decoded: %d channels, %d Hz, %llu frames", channels, sampleRate, mp3FrameCount);
                mAudioBuffer.assign(pMp3Data, pMp3Data + (mp3FrameCount * channels));
                drmp3_free(pMp3Data, NULL);
                decoded = true;
            }
        }
    }

    if (!decoded) {
        LOGE("Failed to decode audio file: %s", filePath);
        return false;
    }

    mSourceChannelCount = channels;
    mSampleRate = sampleRate;
    mIsLoaded = true;

    mAudioBuffer.shrink_to_fit();

    // Re-open and start stream with new parameters
    return start();
}

void EuphoricAudioEngine::resetStream() {
    std::lock_guard<std::mutex> lock(mLock);
    if (mStream) {
        mStream->stop();
        mStream->close();
        mStream.reset();
    }
}

bool EuphoricAudioEngine::start() {
    // If called from loadAudio, lock is already held. But JNI calls start separately too.
    // However, start is simple enough that we can use a try_lock or similar if needed.
    // For now, let's assume it's called safely.
    
    if (!mIsLoaded) {
        LOGE("No audio file loaded");
        return false;
    }

    if (mStream && mStream->getState() == oboe::StreamState::Started) {
        return true; // Already running
    }

    oboe::AudioStreamBuilder builder;
    builder.setCallback(this)
        ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
        ->setSharingMode(oboe::SharingMode::Exclusive)
        ->setFormat(oboe::AudioFormat::Float)
        ->setChannelCount(oboe::ChannelCount::Stereo) // Always request Stereo for the output
        ->setSampleRate(mSampleRate)
        ->setSampleRateConversionQuality(oboe::SampleRateConversionQuality::High);

    oboe::Result result = builder.openStream(mStream);
    if (result != oboe::Result::OK) {
        LOGE("Error opening stream: %s", oboe::convertToText(result));
        // Fallback to Shared mode if Exclusive fails
        builder.setSharingMode(oboe::SharingMode::Shared);
        result = builder.openStream(mStream);
        if (result != oboe::Result::OK) {
            LOGE("Error opening shared stream: %s", oboe::convertToText(result));
            return false;
        }
    }

    mChannelCount = mStream->getChannelCount();
    
    result = mStream->requestStart();
    if (result != oboe::Result::OK) {
        LOGE("Error starting stream: %s", oboe::convertToText(result));
        return false;
    }

    LOGI("Stream started: %d Hz, %d channels (Source: %d Hz, %d channels, Mode: %s)", 
        mStream->getSampleRate(), mChannelCount, mSampleRate, mSourceChannelCount,
        (mStream->getSharingMode() == oboe::SharingMode::Exclusive ? "Exclusive" : "Shared"));
    
    return true;
}

void EuphoricAudioEngine::stop() {
    mIsStopping = true;
    std::lock_guard<std::mutex> lock(mLock);
    if (mStream) {
        mStream->stop();
        mStream->close();
        mStream.reset();
        LOGI("Stream stopped and closed");
    }
    mIsStopping = false;
}

oboe::DataCallbackResult EuphoricAudioEngine::onAudioReady(
        oboe::AudioStream *audioStream,
        void *audioData,
        int32_t numFrames) {

    if (mIsStopping || !mIsLoaded) {
        std::memset(audioData, 0, numFrames * mChannelCount * sizeof(float));
        return oboe::DataCallbackResult::Continue;
    }

    auto *outputData = static_cast<float *>(audioData);
    
    size_t currentIndex = mReadIndex.load(std::memory_order_relaxed);
    
    // Calculate how many frames we can actually read from the source
    size_t sourceFramesAvailable = (mAudioBuffer.size() > currentIndex) ? 
                                   (mAudioBuffer.size() - currentIndex) / mSourceChannelCount : 0;
    
    int32_t framesToProcess = std::min(numFrames, static_cast<int32_t>(sourceFramesAvailable));
    
    float targetVol = mTargetVolume.load(std::memory_order_relaxed);
    float currentVol = mCurrentVolume.load(std::memory_order_relaxed);
    
    for (int32_t frame = 0; frame < framesToProcess; ++frame) {
        // Smooth volume ramping per frame
        if (std::abs(currentVol - targetVol) > kVolumeIncrement) {
            if (currentVol < targetVol) currentVol += kVolumeIncrement;
            else currentVol -= kVolumeIncrement;
        } else {
            currentVol = targetVol;
        }
        
        // Handle channel mapping
        if (mSourceChannelCount == 1 && mChannelCount == 2) {
            // Mono to Stereo expansion
            float sample = mAudioBuffer[currentIndex + frame] * currentVol;
            outputData[frame * 2] = sample;
            outputData[frame * 2 + 1] = sample;
        } else if (mSourceChannelCount == 2 && mChannelCount == 2) {
            // Stereo to Stereo passthrough
            outputData[frame * 2] = mAudioBuffer[currentIndex + frame * 2] * currentVol;
            outputData[frame * 2 + 1] = mAudioBuffer[currentIndex + frame * 2 + 1] * currentVol;
        } else if (mSourceChannelCount == mChannelCount) {
            // Generic N to N (e.g. Mono to Mono)
            for (int32_t c = 0; c < mChannelCount; ++c) {
                outputData[frame * mChannelCount + c] = mAudioBuffer[currentIndex + frame * mChannelCount + c] * currentVol;
            }
        } else {
            // Fallback: zero out if mismatch not handled
            for (int32_t c = 0; c < mChannelCount; ++c) {
                outputData[frame * mChannelCount + c] = 0.0f;
            }
        }
    }
    
    mCurrentVolume.store(currentVol, std::memory_order_relaxed);

    // Fill remaining buffer with silence if we ran out of data
    if (framesToProcess < numFrames) {
        std::memset(outputData + (framesToProcess * mChannelCount), 0, 
                    (numFrames - framesToProcess) * mChannelCount * sizeof(float));
    }
    
    // Update read index based on source frames consumed
    mReadIndex.fetch_add(framesToProcess * mSourceChannelCount, std::memory_order_relaxed);

    return oboe::DataCallbackResult::Continue;
}

void EuphoricAudioEngine::onErrorAfterClose(oboe::AudioStream *audioStream, oboe::Result result) {
    if (result == oboe::Result::ErrorDisconnected) {
        LOGI("Stream disconnected, attempting to restart...");
        // Re-run start logic. JNI will also handle this if the app is still active.
        start();
    }
}
