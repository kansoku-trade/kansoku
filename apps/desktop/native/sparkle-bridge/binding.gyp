{
  "targets": [
    {
      "target_name": "sparkle_bridge",
      "sources": ["src/sparkle_bridge.mm"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "12.0",
        "ARCHS": ["arm64"],
        "OTHER_CFLAGS": ["-ObjC++", "-F<(module_root_dir)/vendor"],
        "FRAMEWORK_SEARCH_PATHS": ["<(module_root_dir)/vendor"],
        "OTHER_LDFLAGS": [
          "-F<(module_root_dir)/vendor",
          "-framework Sparkle",
          "-Wl,-rpath,@loader_path/../../vendor",
          "-Wl,-rpath,@loader_path/../../../../../../Frameworks"
        ]
      }
    }
  ]
}
