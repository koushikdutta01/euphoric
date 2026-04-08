cmake_minimum_required(VERSION 3.18.1)

project(euphoric-audio)

find_package(oboe REQUIRED CONFIG)

add_library(
        euphoric-audio
        SHARED
        src/main/cpp/EuphoricAudioEngine.cpp
        src/main/cpp/jni.cpp
)

target_include_directories(
        euphoric-audio
        PRIVATE
        src/main/cpp
)

target_link_libraries(
        euphoric-audio
        oboe::oboe
        log
)
