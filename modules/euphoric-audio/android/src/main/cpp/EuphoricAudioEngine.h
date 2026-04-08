#pragma once

#include <oboe/Oboe.h>
#include <memory>
#include <vector>
#include <atomic>

class EuphoricAudioEngine : public oboe::AudioStreamCallback {
public:
    EuphoricAudioEngine();
    ~EuphoricAudioEngine();

    bool start();
    void stop();
    bool loadAudio(const char* filePath);
    void setVolume(float volume);
    void seekTo(double seconds);
    
    double getCurrentPosition();
    double getTotalDuration();
    int32_t getSampleRate() { return mSampleRate; }
    int32_t getChannelCount() { return mChannelCount; }

    // From AudioStreamCallback
    oboe::DataCallbackResult onAudioReady(
            oboe::AudioStream *audioStream,
            void *audioData,
            int32_t numFrames) override;

private:
    std::shared_ptr<oboe::AudioStream> mStream;
    std::vector<float> mAudioBuffer;
    std::atomic<size_t> mReadIndex{0};
    std::atomic<bool> mIsLoaded{false};
    std::atomic<bool> mIsStopping{false};
    
    std::atomic<float> mCurrentVolume{0.0f};
    std::atomic<float> mTargetVolume{1.0f};
    static constexpr float kVolumeIncrement = 0.005f; // For smooth fading
    
    int32_t mSampleRate = 44100;
    int32_t mChannelCount = 2;

    void resetStream();
};
