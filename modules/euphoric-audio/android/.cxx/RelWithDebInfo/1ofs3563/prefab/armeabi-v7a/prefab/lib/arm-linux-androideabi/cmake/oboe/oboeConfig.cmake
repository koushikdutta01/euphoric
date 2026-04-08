if(NOT TARGET oboe::oboe)
add_library(oboe::oboe SHARED IMPORTED)
set_target_properties(oboe::oboe PROPERTIES
    IMPORTED_LOCATION "/home/koushik/.gradle/caches/8.14.3/transforms/1331eaff4962d9fd3efca896090354e4/transformed/oboe-1.8.0/prefab/modules/oboe/libs/android.armeabi-v7a/liboboe.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/koushik/.gradle/caches/8.14.3/transforms/1331eaff4962d9fd3efca896090354e4/transformed/oboe-1.8.0/prefab/modules/oboe/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

