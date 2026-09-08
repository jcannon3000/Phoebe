package app.withphoebe.mobile;

import android.content.Intent;

import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BibleBrowser — Android.
 *
 * The same plugin NAME as ios/App/App/BibleBrowserPlugin.swift, so
 * native-shell.ts needs zero changes: Capacitor resolves a plugin by name
 * across platforms, and the shell already prefers `Capacitor.Plugins.
 * BibleBrowser?.open` and falls back to Browser.open when it is absent. It was
 * absent here, which is how the whole Android reading path ended up in a
 * Chrome Custom Tab with the office pill and the saved page thrown away — see
 * the note at the top of ReaderActivity.
 *
 * WHAT IS AND IS NOT PORTED. `open` is the real thing. `openReader` maps to the
 * same activity because Android has no Safari-Reader equivalent to ask for —
 * routing it here keeps the phoebe:browserfinished contract that marks a
 * newsletter read on CLOSE, which a Custom Tab could not honour either.
 * `preload` resolves without doing anything: it is a latency optimisation on
 * iOS (warming a background WKWebView), and a no-op is the correct Android
 * answer rather than a rejection the JS would log.
 */
@CapacitorPlugin(name = "BibleBrowser")
public class BibleBrowserPlugin extends Plugin {

    /**
     * The bridge, held statically so ReaderActivity can post window events
     * back into the app's own WebView.
     *
     * ReaderActivity is a separate Activity with no handle on the plugin
     * instance, and the events it fires (phoebe:office-next-slide and friends)
     * have to reach the SAME web view the deck is mounted in. Cleared in
     * handleOnDestroy so a torn-down bridge is never called into.
     */
    private static Bridge sharedBridge;

    @Override
    public void load() {
        sharedBridge = getBridge();
    }

    @Override
    protected void handleOnDestroy() {
        sharedBridge = null;
        super.handleOnDestroy();
    }

    /** Dispatch a bare window event into the app's web view. No-op if the
     *  bridge is gone (the app was killed while a reading was open). */
    static void fireWindowEvent(String name) {
        Bridge b = sharedBridge;
        if (b == null) return;
        try {
            b.triggerWindowJSEvent(name);
        } catch (Exception ignored) {
            // A dead bridge is not worth crashing a reading over.
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing or invalid url");
            return;
        }
        Intent i = new Intent(getContext(), ReaderActivity.class);
        i.putExtra(ReaderActivity.EXTRA_URL, url);
        /*
         * savedHtml is the offline layer's whole point — the publisher's page
         * kept whole rather than its text extracted — so it rides here and
         * ReaderActivity loads it under the original URL as its base.
         */
        String savedHtml = call.getString("savedHtml");
        if (savedHtml != null && !savedHtml.isEmpty()) {
            i.putExtra(ReaderActivity.EXTRA_SAVED_HTML, savedHtml);
        }
        i.putExtra(ReaderActivity.EXTRA_OFFICE_CHROME, Boolean.TRUE.equals(call.getBoolean("officeChrome", false)));
        i.putExtra(ReaderActivity.EXTRA_BACK_CHROME, Boolean.TRUE.equals(call.getBoolean("backChrome", false)));
        i.putExtra(ReaderActivity.EXTRA_OFFICE_TITLE, call.getString("officeTitle", ""));
        i.putExtra(ReaderActivity.EXTRA_SLIDE_LABEL, call.getString("slideLabel", ""));
        i.putExtra(ReaderActivity.EXTRA_SECTION_LABEL, call.getString("sectionLabel", ""));
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openReader(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing or invalid url");
            return;
        }
        Intent i = new Intent(getContext(), ReaderActivity.class);
        i.putExtra(ReaderActivity.EXTRA_URL, url);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void preload(PluginCall call) {
        call.resolve();
    }
}
