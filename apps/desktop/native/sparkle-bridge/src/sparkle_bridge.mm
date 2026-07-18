#import <Foundation/Foundation.h>
#import <Sparkle/Sparkle.h>
#include <napi.h>

// Sparkle needs SPUUpdaterDelegate to observe a check cycle finishing/aborting; we log
// through it purely for diagnostics (no NSAlert or unified-log line is otherwise
// guaranteed for a headless run in a sandbox with no attached display).
@interface SparkleBridgeLogDelegate : NSObject <SPUUpdaterDelegate>
@end

@implementation SparkleBridgeLogDelegate

- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)updateCheck error:(nullable NSError *)error {
  if (error != nil) {
    NSLog(@"[sparkle-bridge] update cycle finished with error: %@", error);
  } else {
    NSLog(@"[sparkle-bridge] update cycle finished with no error (no update found or update path taken)");
  }
}

- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error {
  NSLog(@"[sparkle-bridge] update check aborted: %@", error);
}

@end

// Forwards all UI to SPUStandardUserDriver, except optionally auto-accepting
// "update found" so titlebar install skips the confirm dialog.
@interface AutoAcceptUserDriver : NSObject <SPUUserDriver>
@property (nonatomic, strong) id<SPUUserDriver> inner;
@property (nonatomic, assign) BOOL autoAcceptFoundUpdate;
@end

@implementation AutoAcceptUserDriver

- (instancetype)initWithInner:(id<SPUUserDriver>)inner {
  self = [super init];
  if (self) {
    _inner = inner;
    _autoAcceptFoundUpdate = NO;
  }
  return self;
}

- (void)showUpdatePermissionRequest:(SPUUpdatePermissionRequest *)request reply:(void (^)(SUUpdatePermissionResponse *))reply {
  [self.inner showUpdatePermissionRequest:request reply:reply];
}

- (void)showUserInitiatedUpdateCheckWithCancellation:(void (^)(void))cancellation {
  [self.inner showUserInitiatedUpdateCheckWithCancellation:cancellation];
}

- (void)showUpdateFoundWithAppcastItem:(SUAppcastItem *)appcastItem state:(SPUUserUpdateState *)state reply:(void (^)(SPUUserUpdateChoice))reply {
  if (self.autoAcceptFoundUpdate && !appcastItem.informationOnlyUpdate) {
    NSLog(@"[sparkle-bridge] auto-accepting found update (install now path)");
    self.autoAcceptFoundUpdate = NO;
    reply(SPUUserUpdateChoiceInstall);
    return;
  }
  self.autoAcceptFoundUpdate = NO;
  [self.inner showUpdateFoundWithAppcastItem:appcastItem state:state reply:reply];
}

- (void)showUpdateReleaseNotesWithDownloadData:(SPUDownloadData *)downloadData {
  [self.inner showUpdateReleaseNotesWithDownloadData:downloadData];
}

- (void)showUpdateReleaseNotesFailedToDownloadWithError:(NSError *)error {
  [self.inner showUpdateReleaseNotesFailedToDownloadWithError:error];
}

- (void)showUpdateNotFoundWithError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
  self.autoAcceptFoundUpdate = NO;
  [self.inner showUpdateNotFoundWithError:error acknowledgement:acknowledgement];
}

- (void)showUpdaterError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
  self.autoAcceptFoundUpdate = NO;
  [self.inner showUpdaterError:error acknowledgement:acknowledgement];
}

- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation {
  [self.inner showDownloadInitiatedWithCancellation:cancellation];
}

- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)expectedContentLength {
  [self.inner showDownloadDidReceiveExpectedContentLength:expectedContentLength];
}

- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length {
  [self.inner showDownloadDidReceiveDataOfLength:length];
}

- (void)showDownloadDidStartExtractingUpdate {
  [self.inner showDownloadDidStartExtractingUpdate];
}

- (void)showExtractionReceivedProgress:(double)progress {
  [self.inner showExtractionReceivedProgress:progress];
}

- (void)showReadyToInstallAndRelaunch:(void (^)(SPUUserUpdateChoice))reply {
  [self.inner showReadyToInstallAndRelaunch:reply];
}

- (void)showInstallingUpdateWithApplicationTerminated:(BOOL)applicationTerminated retryTerminatingApplication:(void (^)(void))retryTerminatingApplication {
  [self.inner showInstallingUpdateWithApplicationTerminated:applicationTerminated retryTerminatingApplication:retryTerminatingApplication];
}

- (void)showUpdateInstalledAndRelaunched:(BOOL)relaunched acknowledgement:(void (^)(void))acknowledgement {
  [self.inner showUpdateInstalledAndRelaunched:relaunched acknowledgement:acknowledgement];
}

- (void)dismissUpdateInstallation {
  self.autoAcceptFoundUpdate = NO;
  [self.inner dismissUpdateInstallation];
}

- (void)showUpdateInFocus {
  if ([self.inner respondsToSelector:@selector(showUpdateInFocus)]) {
    [self.inner showUpdateInFocus];
  }
}

@end

namespace {

SPUUpdater *g_updater = nil;
AutoAcceptUserDriver *g_userDriver = nil;
SPUStandardUserDriver *g_standardDriver = nil;
SparkleBridgeLogDelegate *g_logDelegate = nil;

NSString *NapiStringToNSString(const Napi::Value &value) {
  if (!value.IsString()) return nil;
  std::string s = value.As<Napi::String>().Utf8Value();
  return [NSString stringWithUTF8String:s.c_str()];
}

Napi::Value Init(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "init(options) requires an options object").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object options = info[0].As<Napi::Object>();
  NSString *appcastUrl = options.Has("appcastUrl") ? NapiStringToNSString(options.Get("appcastUrl")) : nil;
  NSString *publicEdKey = options.Has("publicEdKey") ? NapiStringToNSString(options.Get("publicEdKey")) : nil;

  __block BOOL initialized = NO;

  void (^work)(void) = ^{
    if (g_updater != nil) {
      initialized = YES;
      return;
    }

    @try {
      g_logDelegate = [[SparkleBridgeLogDelegate alloc] init];
      NSBundle *hostBundle = [NSBundle mainBundle];
      g_standardDriver = [[SPUStandardUserDriver alloc] initWithHostBundle:hostBundle delegate:nil];
      g_userDriver = [[AutoAcceptUserDriver alloc] initWithInner:g_standardDriver];
      g_updater = [[SPUUpdater alloc] initWithHostBundle:hostBundle
                                       applicationBundle:hostBundle
                                              userDriver:g_userDriver
                                                delegate:g_logDelegate];

      NSString *plistFeedUrl = hostBundle.infoDictionary[@"SUFeedURL"];
      NSString *plistPublicKey = hostBundle.infoDictionary[@"SUPublicEDKey"];

      if (appcastUrl != nil && plistFeedUrl == nil) {
        // Info.plist SUFeedURL is the packaged-build source of truth; -setFeedURL: is a
        // documented (if deprecated) escape hatch for configuring it out-of-plist, which we
        // use only when the plist key is absent (e.g. dev-shell runs against a stub bundle).
        NSURL *url = [NSURL URLWithString:appcastUrl];
        if (url != nil) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
          [g_updater setFeedURL:url];
#pragma clang diagnostic pop
        }
      }

      if (publicEdKey != nil && plistPublicKey == nil) {
        // Sparkle deliberately exposes no public runtime API to set SUPublicEDKey — the
        // signing key must live in the signed Info.plist so a compromised JS layer can't
        // swap in an attacker key at runtime. We can only surface the mismatch, not fix it.
        NSLog(
            @"[sparkle-bridge] publicEdKey was supplied but Info.plist has no SUPublicEDKey; "
             "Sparkle has no supported runtime setter for it — the key must be baked into the "
             "signed Info.plist at package time.");
      }

      NSError *startError = nil;
      if (![g_updater startUpdater:&startError]) {
        NSLog(@"[sparkle-bridge] startUpdater failed: %@", startError);
        g_updater = nil;
        g_userDriver = nil;
        g_standardDriver = nil;
        g_logDelegate = nil;
        initialized = NO;
        return;
      }

      initialized = YES;
    } @catch (NSException *exception) {
      NSLog(@"[sparkle-bridge] init threw: %@", exception.reason);
      g_updater = nil;
      g_userDriver = nil;
      g_standardDriver = nil;
      g_logDelegate = nil;
      initialized = NO;
    }
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_sync(dispatch_get_main_queue(), work);
  }

  return Napi::Boolean::New(env, initialized);
}

void RunUpdateCheck(BOOL autoAccept) {
  void (^work)(void) = ^{
    if (g_updater == nil || g_userDriver == nil) return;
    @try {
      NSLog(@"[sparkle-bridge] checkForUpdates: autoAccept=%d canCheckForUpdates=%d sessionInProgress=%d",
            autoAccept, g_updater.canCheckForUpdates, g_updater.sessionInProgress);
      g_userDriver.autoAcceptFoundUpdate = autoAccept;
      [g_updater checkForUpdates];
    } @catch (NSException *exception) {
      NSLog(@"[sparkle-bridge] checkForUpdates threw: %@", exception.reason);
      g_userDriver.autoAcceptFoundUpdate = NO;
    }
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_async(dispatch_get_main_queue(), work);
  }
}

Napi::Value CheckForUpdates(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  RunUpdateCheck(NO);
  return env.Undefined();
}

Napi::Value InstallUpdateNow(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  RunUpdateCheck(YES);
  return env.Undefined();
}

Napi::Value SetAutomaticChecks(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBoolean()) {
    Napi::TypeError::New(env, "setAutomaticChecks(enabled) requires a boolean").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  bool enabled = info[0].As<Napi::Boolean>().Value();

  void (^work)(void) = ^{
    if (g_updater == nil) return;
    @try {
      g_updater.automaticallyChecksForUpdates = enabled;
    } @catch (NSException *exception) {
      NSLog(@"[sparkle-bridge] setAutomaticChecks threw: %@", exception.reason);
    }
  };

  if ([NSThread isMainThread]) {
    work();
  } else {
    dispatch_async(dispatch_get_main_queue(), work);
  }

  return env.Undefined();
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "init"), Napi::Function::New(env, Init));
  exports.Set(Napi::String::New(env, "checkForUpdates"), Napi::Function::New(env, CheckForUpdates));
  exports.Set(Napi::String::New(env, "installUpdateNow"), Napi::Function::New(env, InstallUpdateNow));
  exports.Set(Napi::String::New(env, "setAutomaticChecks"), Napi::Function::New(env, SetAutomaticChecks));
  return exports;
}

}  // namespace

NODE_API_MODULE(sparkle_bridge, InitModule)
