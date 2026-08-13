package app.withphoebe.mobile;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PhoebeAudioPlugin.java — Android port of PhoebeAudioPlugin.swift (see that
 * file for the fuller design rationale). Same JS front door (native-shell.ts
 * wireContemplation / haptics call this via window.Capacitor.Plugins.PhoebeAudio
 * — no JS changes needed, Capacitor resolves the same plugin name cross-platform):
 *
 *   PhoebeAudio.prime()                       — request audio focus
 *   PhoebeAudio.playNow({ sound })             — fire-and-forget playback
 *   PhoebeAudio.scheduleBellAt({ at, sound })  — schedule a future bell
 *   PhoebeAudio.cancelScheduled()              — cancel a pending schedule
 *   PhoebeAudio.smoothSwell({ durationMs, peak, sharpness }) — haptic swell
 *
 * scheduleBellNotification / cancelBellNotification are DELIBERATELY not
 * implemented here — the JS caller already falls back to the generic,
 * cross-platform Capacitor LocalNotifications.schedule() when this plugin
 * doesn't expose those two methods (see native-shell.ts wireContemplation),
 * so there is nothing Android-specific to add.
 *
 * Android's process/audio model differs from iOS's AVAudioSession + silent-
 * loop background-audio trick: an Android app with the screen kept awake
 * (the keep-awake plugin already does this for a contemplation sit) stays
 * alive through scheduleBellAt's delay without needing a foreground service
 * or wake lock of our own, so a plain main-thread Handler.postDelayed is a
 * faithful, honest v1 port — the LocalNotifications fallback above is what
 * covers the backgrounded/locked-screen case, exactly like it does on iOS
 * when PhoebeAudio's native path is unavailable.
 */
@CapacitorPlugin(name = "PhoebeAudio")
public class PhoebeAudioPlugin extends Plugin {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingBell;
    private MediaPlayer scheduledPlayer;
    private MediaPlayer nowPlayer;
    private AudioFocusRequest focusRequest;

    // ── Sound lookup ──────────────────────────────────────────────────────
    // JS passes an iOS-shaped filename, e.g. "PhoebeRising-high.caf" — the
    // bundled res/raw resources are named after the same source files,
    // lowercased with dashes turned into underscores and no extension
    // (Android resource names are restricted to [a-z0-9_]). See
    // android/app/src/main/res/raw/ — converted from the .caf originals.
    private int resolveRawSound(String soundName) {
        if (soundName == null) return 0;
        String base = soundName;
        int dot = base.lastIndexOf('.');
        if (dot >= 0) base = base.substring(0, dot);
        String resName = base.toLowerCase(java.util.Locale.US).replace('-', '_');
        return getContext().getResources().getIdentifier(resName, "raw", getContext().getPackageName());
    }

    private void releasePlayer(MediaPlayer player) {
        if (player == null) return;
        try {
            if (player.isPlaying()) player.stop();
        } catch (IllegalStateException ignored) {
            // already stopped/released — non-fatal
        }
        player.release();
    }

    // ── Audio focus ────────────────────────────────────────────────────────
    // Transient + "may duck" — mirrors the iOS session's .mixWithOthers: we
    // don't want a brief bell to fully silence whatever else is playing.
    private void requestFocus() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attrs)
                .build();
            am.requestAudioFocus(focusRequest);
        } else {
            am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
    }

    @PluginMethod
    public void prime(PluginCall call) {
        requestFocus();
        call.resolve();
    }

    @PluginMethod
    public void playNow(PluginCall call) {
        String sound = call.getString("sound");
        if (sound == null) {
            call.reject("missing sound");
            return;
        }
        int resId = resolveRawSound(sound);
        if (resId == 0) {
            call.reject("sound not found: " + sound);
            return;
        }
        try {
            requestFocus();
            releasePlayer(nowPlayer);
            MediaPlayer player = MediaPlayer.create(getContext(), resId);
            if (player == null) {
                call.reject("failed to load sound: " + sound);
                return;
            }
            nowPlayer = player;
            player.setOnCompletionListener(MediaPlayer::release);
            player.start();
            call.resolve();
        } catch (Exception e) {
            call.reject("play failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void scheduleBellAt(PluginCall call) {
        Double atMs = call.getDouble("at");
        String sound = call.getString("sound", "PhoebeRising-high.caf");
        if (atMs == null) {
            call.reject("missing at");
            return;
        }
        long delay = (long) (atMs - System.currentTimeMillis());
        if (delay <= 50) {
            call.reject("target time too soon or in past");
            return;
        }
        int resId = resolveRawSound(sound);
        if (resId == 0) {
            call.reject("bell sound not found: " + sound);
            return;
        }
        // Clear any prior schedule before laying down the new one, same as
        // the iOS teardownPlayers() call at the top of scheduleBellAt.
        cancelPendingBell();
        requestFocus();
        final int finalResId = resId;
        pendingBell = () -> {
            try {
                releasePlayer(scheduledPlayer);
                MediaPlayer player = MediaPlayer.create(getContext(), finalResId);
                if (player != null) {
                    scheduledPlayer = player;
                    player.setOnCompletionListener(MediaPlayer::release);
                    player.start();
                }
            } catch (Exception ignored) {
                // Best-effort — the LocalNotifications fallback (scheduled
                // in parallel by the JS caller) is the backstop.
            }
            pendingBell = null;
        };
        mainHandler.postDelayed(pendingBell, delay);
        call.resolve();
    }

    @PluginMethod
    public void cancelScheduled(PluginCall call) {
        cancelPendingBell();
        call.resolve();
    }

    private void cancelPendingBell() {
        if (pendingBell != null) {
            mainHandler.removeCallbacks(pendingBell);
            pendingBell = null;
        }
        releasePlayer(scheduledPlayer);
        scheduledPlayer = null;
    }

    // ── Smooth completion haptic ──────────────────────────────────────────
    // Android equivalent of the iOS Core Haptics parabolic swell: a single
    // VibrationEffect.createWaveform with a discrete amplitude envelope that
    // rises to `peak` at the midpoint and falls back to 0 — the same shape,
    // just quantized into steps instead of a continuous curve. No-ops (same
    // {ok:false} contract as iOS) on hardware without amplitude control —
    // pre-Oreo devices and anything that can't vary vibration strength would
    // otherwise just buzz at one flat intensity, which reads as a plain tap,
    // not a swell.
    @PluginMethod
    public void smoothSwell(PluginCall call) {
        Vibrator vibrator = getVibrator();
        if (vibrator == null || !vibrator.hasVibrator()
            || Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !vibrator.hasAmplitudeControl()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            call.resolve(result);
            return;
        }
        double durationMs = call.getDouble("durationMs", 1300.0);
        double peak = call.getDouble("peak", 1.0);
        // sharpness has no Android amplitude-control analog (it maps to
        // CHHapticEventParameter.hapticSharpness, a texture/frequency knob
        // Android's vibration API doesn't expose) — accepted for API parity
        // with iOS but intentionally unused here.
        call.getDouble("sharpness", 0.3);

        int steps = 18;
        long[] timings = new long[steps];
        int[] amplitudes = new int[steps];
        long stepMs = Math.max(1, (long) (durationMs / steps));
        for (int i = 0; i < steps; i++) {
            double t = (double) i / (steps - 1);
            // Parabolic envelope: 0 at both ends, 1 at the midpoint —
            // identical formula to the iOS control-point curve.
            double value = Math.max(0.0, 1.0 - Math.pow(2.0 * t - 1.0, 2.0));
            timings[i] = stepMs;
            amplitudes[i] = (int) Math.round(Math.max(1, Math.min(255, value * peak * 255)));
        }
        try {
            vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1));
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("smoothSwell failed: " + e.getMessage());
        }
    }

    private Vibrator getVibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
    }

    @Override
    protected void handleOnDestroy() {
        cancelPendingBell();
        releasePlayer(nowPlayer);
        nowPlayer = null;
        super.handleOnDestroy();
    }
}
