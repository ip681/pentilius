# The Linux build environment for the Android app (owner decision, 2026-10-19:
# build on our own machine, in Docker — Windows' 260-character path limit
# breaks the native part of the build, Linux has no such limit).
# Built once, then reused: Node 24, Java 17 and the Android SDK pieces the
# app needs (platform 36, build-tools, NDK and CMake for the native code).
FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jdk-headless unzip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Android command-line tools (the official Google download, checked by its SHA-256).
ARG CMDLINE_TOOLS=commandlinetools-linux-15859902_latest.zip
ARG CMDLINE_TOOLS_SHA256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
 && curl -fsSL -o /tmp/tools.zip https://dl.google.com/android/repository/$CMDLINE_TOOLS \
 && if [ -n "$CMDLINE_TOOLS_SHA256" ]; then echo "$CMDLINE_TOOLS_SHA256  /tmp/tools.zip" | sha256sum -c -; fi \
 && unzip -q /tmp/tools.zip -d /tmp/tools \
 && mv /tmp/tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
 && rm -rf /tmp/tools /tmp/tools.zip

ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN yes | sdkmanager --licenses > /dev/null \
 && sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1" > /dev/null

WORKDIR /work
