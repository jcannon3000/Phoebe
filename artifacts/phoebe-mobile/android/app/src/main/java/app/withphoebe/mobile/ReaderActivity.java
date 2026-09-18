package app.withphoebe.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;

/**
 * THE READING, WITH THE LITURGY STILL AROUND IT — Android's half of
 * BibleBrowser (ios/App/App/BibleWebViewController.swift).
 *
 * Android had no port of this at all, so `openInAppBrowser` fell through to
 * Capacitor's Browser.open — a Chrome Custom Tab. Two things broke there, and
 * both are core practice rather than polish:
 *
 *   1. The OFFICE PILL disappeared. Every deck (the office, Lectio, Visio, the
 *      Rosary) hands a passage to the reader and expects the reader's own
 *      Back/Next to step the deck underneath by posting
 *      phoebe:office-{prev,next}-slide. A Custom Tab has no such control, so
 *      you tapped a reference, read it, came back — and nothing had moved.
 *   2. `savedHtml` WAS SILENTLY DROPPED. The whole offline layer saves whole
 *      pages (never extracted text — that is a copyright question, and the
 *      answer is to keep the publisher's page whole) and hands them here. A
 *      Custom Tab can only take a URL, so offline every reading failed to load
 *      while the app insisted it had them saved.
 *
 * THE READER VIEW (2026-09-16). iOS restyles the publisher's page in place —
 * oremus, SSJE, Nouwen, Day by Day, Sojourners, The Living Church — with one
 * script, `readerJS` in BibleWebViewController.swift, injected at document
 * start. The same script is extracted at build time into the asset
 * phoebe-reader.js (scripts/extract-reader-js.mjs; `pnpm run
 * cap:sync:android`) and injected here the same way, so the two platforms
 * cannot drift. The script decides whether a page is one it dresses: it
 * defines window.__phoebeReaderSet only on those hosts, and that — not a
 * second host list kept here — is what shows the Reader/Standard button.
 * Reader mode paints the page transparent, so the deck's leaf photograph
 * sits behind the WebView under a heavy wash, as on iOS. Text size is the
 * WebView's own zoom (the aA button), remembered across readings. "Previous"
 * lists a newsletter's earlier issues and loads them in place, so Done still
 * finishes the reading. Not ported: the loading veil and deep-link scrolling.
 *
 * This is the contract the web layer depends on: load a saved page or a URL,
 * keep a Done button pinned, carry the office pill when asked, and fire
 * phoebe:browserfinished on the way out so a newsletter marks read when it is
 * CLOSED rather than when it is opened.
 */
public class ReaderActivity extends Activity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_SAVED_HTML = "savedHtml";
    public static final String EXTRA_OFFICE_CHROME = "officeChrome";
    public static final String EXTRA_OFFICE_TITLE = "officeTitle";
    public static final String EXTRA_SLIDE_LABEL = "slideLabel";
    public static final String EXTRA_SECTION_LABEL = "sectionLabel";
    public static final String EXTRA_BACK_CHROME = "backChrome";
    /** JSON: [{"title": …, "url": …}, …], newest first. */
    public static final String EXTRA_PREVIOUS = "previous";

    // The deck's own tokens (capacitor.config.ts android.backgroundColor and
    // index.css --oh-ink / --ot-sage), so the reader reads as the same app.
    private static final int BG = Color.parseColor("#091A10");
    private static final int WARM = Color.parseColor("#F0EDE6");
    private static final int SAGE = Color.parseColor("#8FAF96");
    private static final int PILL_BG = Color.parseColor("#152B1D");
    private static final int PILL_BORDER = Color.parseColor("#2E6B40");
    private static final int CTA_BG = Color.parseColor("#2D5E3F");
    /** The leaf under a heavy wash — the reader's ground, as the decks have it. */
    private static final int WASH = Color.parseColor("#CC091A10");

    private static final String PREFS = "phoebe-reader";
    private static final String PREF_TEXT_ZOOM = "text-zoom";
    private static final String PREF_READER_ON = "reader-on";
    /** The aA steps, as WebView text zoom percentages. */
    private static final int[] TEXT_ZOOMS = { 100, 115, 130, 145 };

    private WebView web;
    private View backdrop;
    /** The video a page put into full screen, and the callback that ends it. */
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private FrameLayout rootFrame;
    private TextView readerToggle;
    private final Handler handler = new Handler(Looper.getMainLooper());
    /** The reader script, or null when the asset wasn't generated (a build
     *  that skipped cap:sync:android): the page then shows as published. */
    private String readerJs;
    private boolean injectedAtStart = false;
    /** Reader mode on (Phoebe's view) or off (the page as published). Remembered. */
    private boolean readerOn = true;
    /** Whether the CURRENT page is one the script dresses. */
    private boolean readerActive = false;
    /** Fired exactly once, whichever way the reader leaves. */
    private boolean finishedEventSent = false;

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        /*
         * No transition in or out (owner, 2026-09-16). The theme's
         * windowAnimationStyle (styles.xml, PhoebeReaderNoTransition) covers
         * the window manager's default; from API 34 an activity may also set
         * its own open/close override, which wins over anything the launcher
         * asked for — so both are zeroed here too. Below 34 the launcher's
         * overridePendingTransition(0, 0) in BibleBrowserPlugin does the same.
         */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, 0, 0);
            overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0);
        }

        Bundle x = getIntent().getExtras();
        final String url = x != null ? x.getString(EXTRA_URL, "") : "";
        final String savedHtml = x != null ? x.getString(EXTRA_SAVED_HTML, null) : null;
        final boolean officeChrome = x != null && x.getBoolean(EXTRA_OFFICE_CHROME, false);
        final boolean backChrome = x != null && x.getBoolean(EXTRA_BACK_CHROME, false);
        final String officeTitle = x != null ? x.getString(EXTRA_OFFICE_TITLE, "") : "";
        final String slideLabel = x != null ? x.getString(EXTRA_SLIDE_LABEL, "") : "";
        final String sectionLabel = x != null ? x.getString(EXTRA_SECTION_LABEL, "") : "";
        final List<String[]> previous = parsePrevious(x != null ? x.getString(EXTRA_PREVIOUS, null) : null);

        if ((url == null || url.isEmpty()) && savedHtml == null) { finish(); return; }

        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        readerOn = prefs.getBoolean(PREF_READER_ON, true);
        readerJs = loadReaderJs(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        root.addView(column, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        column.addView(buildTopBar(officeTitle, backChrome, previous), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // The page area: the leaf and its wash first, then a transparent
        // WebView over them. A page as published paints its own ground over
        // the leaf; reader mode leaves the page transparent so it shows.
        FrameLayout page = new FrameLayout(this);
        backdrop = buildBackdrop();
        page.addView(backdrop, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(dp(36), dp(36));
        sp.gravity = Gravity.CENTER;

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // A publisher's page is laid out for a phone only when it is told the
        // viewport is one; without these an oremus page renders at desktop
        // width and the reader has to pinch every passage.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(prefs.getInt(PREF_TEXT_ZOOM, 100));
        // NO algorithmic darkening. It used to be on so a light page didn't
        // flash white between the deck and the reading, but it recolours the
        // page — oremus came up black with orange headings under "Standard",
        // which is meant to be the page as published (owner: "the standard
        // option for all readers need to show the actual page un edited").
        // The reader view is dark by its own design, and the leaf backdrop
        // covers the load, so nothing is lost.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            s.setAlgorithmicDarkeningAllowed(false);
        }
        /*
         * THE READER SCRIPT, AT DOCUMENT START — the same moment iOS's
         * WKUserScript runs, so the publisher's own design never flashes
         * first. Older WebViews without the feature get it on the first
         * commit instead; the script tolerates arriving late (it re-runs on
         * DOMContentLoaded and on a settle interval), at the cost of a flash.
         */
        if (readerJs != null && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, readerJs, new HashSet<>(Collections.singletonList("*")));
            injectedAtStart = true;
        }
        /*
         * VIDEO, FULL SCREEN, STILL INSIDE PHOEBE (owner, 2026-09-18: "even go
         * full screen without it looking like you're leaving the app").
         *
         * A WebView shows HTML5 video inline on its own, but the player's
         * full-screen button does nothing at all unless a WebChromeClient
         * takes the view it hands over — onShowCustomView — and puts it on
         * screen. Without this the reader is a dead end for video: the button
         * is there and tapping it is silently ignored.
         *
         * It matters most on iOS, where the reader IS the video surface (the
         * app's own capacitor:// origin can't embed YouTube at all — see the
         * web side's lib/videoEmbed), so a service or a course lesson watched
         * on an iPhone plays in this same container's twin. Android embeds in
         * place and rarely comes through here, but a publisher's page with a
         * video in it now works either way.
         *
         * The view covers the whole activity while it is up, and the page's
         * own exit (or Back, below) takes it down again.
         */
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    // A second video while one is already full screen: let the
                    // page know the first is finished rather than stacking.
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = view;
                fullscreenCallback = callback;
                view.setBackgroundColor(Color.BLACK);
                if (rootFrame != null) {
                    rootFrame.addView(view, new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                }
                // Let the video have the status and gesture bars too.
                WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                bars.hide(WindowInsetsCompat.Type.systemBars());
            }

            @Override
            public void onHideCustomView() {
                exitFullscreenVideo();
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                // Links inside a reading stay inside the reading — that is the
                // point of a pinned Done button. Only a non-http scheme (mailto,
                // tel) leaves, and those are left to the system.
                String scheme = r.getUrl() != null ? r.getUrl().getScheme() : null;
                return scheme != null && !scheme.equals("http") && !scheme.equals("https");
            }
            @Override
            public void onPageStarted(WebView v, String u, android.graphics.Bitmap favicon) {
                // A new page: nothing is known about it until the script says.
                setReaderActive(false);
                probesLeft = 12;
            }
            @Override
            public void onPageCommitVisible(WebView v, String u) {
                if (!injectedAtStart && readerJs != null) v.evaluateJavascript(readerJs, null);
                // The script has run by now (document start); the page's word
                // on whether it dresses it is available long before the ads
                // and iframes that hold up onPageFinished — a Living Church
                // post sat dressed for a minute with no Standard button.
                probeReader();
            }
            @Override
            public void onPageFinished(WebView v, String u) {
                spinner.setVisibility(View.GONE);
                probeReader();
            }
        });
        page.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        page.addView(spinner, sp);
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        column.addView(page, pp);

        if (officeChrome) {
            root.addView(buildOfficePill(slideLabel, sectionLabel));
        }

        rootFrame = root;
        setContentView(root);

        if (savedHtml != null && !savedHtml.isEmpty()) {
            /*
             * THE SAVED PAGE, UNDER ITS OWN ORIGIN. The base URL matters: it is
             * what relative links, images and stylesheets in the saved markup
             * resolve against, and it is the origin the page's own scripts run
             * as. Passing null would make every relative asset in a saved
             * oremus page 404 and the passage would come up unstyled.
             */
            web.loadDataWithBaseURL(url, savedHtml, "text/html", "UTF-8", url);
        } else {
            web.loadUrl(url);
        }
    }

    /** The reader script from the generated asset, or null when it isn't there. */
    private static String loadReaderJs(Context c) {
        try (InputStream in = c.getAssets().open("phoebe-reader.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            return null;
        }
    }

    private static List<String[]> parsePrevious(String json) {
        List<String[]> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String title = o.optString("title", "");
                String url = o.optString("url", "");
                if (!title.isEmpty() && url.startsWith("http")) out.add(new String[] { title, url });
            }
        } catch (Exception ignored) {
            // A malformed list is no list.
        }
        return out;
    }

    /**
     * Ask the page whether the reader script took it. The script defines
     * window.__phoebeReaderSet only on the hosts it dresses, and stamps
     * data-phoebe-reader-applied once its sheet is on — so the button and
     * the backdrop follow the page's own word, not a host list kept here.
     * Asked again as the page settles: SSJE streams its post in late.
     */
    private void probeReader() {
        if (web == null || readerJs == null) return;
        web.evaluateJavascript("typeof window.__phoebeReaderSet === 'function'", v -> {
            boolean active = "true".equals(v);
            if (active == readerActive) return;
            setReaderActive(active);
            if (active) applyReaderState();
        });
        // Ask again as the page settles (SSJE streams its post in late), but
        // not forever: the probe is cheap, the loop is not.
        if (probesLeft > 0) {
            probesLeft--;
            handler.postDelayed(() -> { if (web != null && !readerActive) probeReader(); }, 900);
        }
    }
    private int probesLeft = 12;

    /**
     * A second `open` while a reading is showing (singleTop) arrives here
     * rather than in onCreate. Rebuilding on the new Intent is the simplest
     * honest answer: the old page, its reader state and its Previous list
     * all belonged to the reading that was replaced.
     */
    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        recreate();
    }

    private void setReaderActive(boolean active) {
        readerActive = active;
        if (readerToggle != null) readerToggle.setVisibility(active ? View.VISIBLE : View.GONE);
        syncBackdrop();
    }

    /** Tell the page which view is wanted, and name the button after what tapping it will do. */
    private void applyReaderState() {
        if (web == null) return;
        web.evaluateJavascript("window.__phoebeReaderSet && window.__phoebeReaderSet(" + readerOn + ")", null);
        if (readerToggle != null) readerToggle.setText(readerOn ? "Standard" : "Reader");
        syncBackdrop();
    }

    /** The leaf belongs to reader mode only — Standard shows the site's own ground. */
    private void syncBackdrop() {
        if (backdrop != null) backdrop.setVisibility(readerActive && readerOn ? View.VISIBLE : View.INVISIBLE);
    }

    private View buildBackdrop() {
        FrameLayout f = new FrameLayout(this);
        ImageView leaf = new ImageView(this);
        leaf.setImageResource(R.drawable.splash);
        leaf.setScaleType(ImageView.ScaleType.CENTER_CROP);
        f.addView(leaf, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        View wash = new View(this);
        wash.setBackgroundColor(WASH);
        f.addView(wash, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        f.setVisibility(View.INVISIBLE);
        return f;
    }

    private View buildTopBar(String title, boolean backChrome, List<String[]> previous) {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BG);
        // The status bar is drawn over by the system; pad below it so Done is
        // never under the clock.
        int top = dp(14) + statusBarHeight();
        bar.setPadding(dp(14), top, dp(14), dp(10));

        TextView done = barButton(backChrome ? "Back" : "Done");
        done.setPadding(dp(4), dp(10), dp(16), dp(10));
        done.setOnClickListener(v -> finish());
        bar.addView(done);

        TextView t = new TextView(this);
        t.setText(title == null ? "" : title);
        t.setTextColor(SAGE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setMaxLines(1);
        t.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bar.addView(t, tp);

        // Right-hand controls, as iOS orders them: aA · Standard/Reader · Previous.
        TextView aa = barButton("aA");
        aa.setOnClickListener(v -> cycleTextZoom());
        bar.addView(aa);

        readerToggle = barButton(readerOn ? "Standard" : "Reader");
        readerToggle.setVisibility(View.GONE);
        readerToggle.setOnClickListener(v -> {
            readerOn = !readerOn;
            getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(PREF_READER_ON, readerOn).apply();
            applyReaderState();
        });
        bar.addView(readerToggle);

        if (!previous.isEmpty()) {
            TextView prev = barButton("Previous");
            prev.setOnClickListener(v -> {
                PopupMenu menu = new PopupMenu(this, prev);
                for (int i = 0; i < previous.size(); i++) menu.getMenu().add(0, i, i, previous.get(i)[0]);
                menu.setOnMenuItemClickListener(item -> {
                    String[] issue = previous.get(item.getItemId());
                    if (web != null) web.loadUrl(issue[1]);
                    return true;
                });
                menu.show();
            });
            bar.addView(prev);
        }
        return bar;
    }

    private TextView barButton(String text) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(WARM);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        // A text button still needs a finger-sized box.
        b.setPadding(dp(10), dp(10), dp(10), dp(10));
        b.setMaxLines(1);
        return b;
    }

    /** aA: step the WebView's text zoom through the sizes, remembered across readings. */
    private void cycleTextZoom() {
        if (web == null) return;
        int current = web.getSettings().getTextZoom();
        int next = TEXT_ZOOMS[0];
        for (int i = 0; i < TEXT_ZOOMS.length; i++) {
            if (TEXT_ZOOMS[i] == current) { next = TEXT_ZOOMS[(i + 1) % TEXT_ZOOMS.length]; break; }
        }
        web.getSettings().setTextZoom(next);
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(PREF_TEXT_ZOOM, next).apply();
    }

    /**
     * The office's floating pill — Back · "N of M · Section" · Next. Tapping
     * either end dismisses the reading and steps the deck that is still
     * mounted underneath, which is the whole mechanism: slides are state in
     * the web layer, not routes, so this reports the tap and lets the web
     * layer decide what "next slide" means.
     */
    private View buildOfficePill(String slideLabel, String sectionLabel) {
        LinearLayout pill = new LinearLayout(this);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PILL_BG);
        bg.setCornerRadius(dp(999));
        bg.setStroke(dp(1), PILL_BORDER);
        pill.setBackground(bg);
        pill.setPadding(dp(8), dp(8), dp(8), dp(8));
        pill.setElevation(dp(8));

        pill.addView(pillButton("Back", false, v -> {
            BibleBrowserPlugin.fireWindowEvent("phoebe:office-prev-slide");
            finish();
        }));

        String label = slideLabel == null ? "" : slideLabel;
        if (sectionLabel != null && !sectionLabel.isEmpty()) {
            label = label.isEmpty() ? sectionLabel : label + " · " + sectionLabel;
        }
        TextView mid = new TextView(this);
        mid.setText(label.toUpperCase());
        mid.setTextColor(SAGE);
        mid.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        mid.setLetterSpacing(0.14f);
        mid.setMaxLines(1);
        mid.setPadding(dp(12), 0, dp(12), 0);
        pill.addView(mid);

        pill.addView(pillButton("Next", true, v -> {
            BibleBrowserPlugin.fireWindowEvent("phoebe:office-next-slide");
            finish();
        }));

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        lp.bottomMargin = dp(20) + navBarHeight();
        pill.setLayoutParams(lp);
        return pill;
    }

    private TextView pillButton(String text, boolean primary, View.OnClickListener onClick) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(WARM);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setPadding(dp(16), dp(10), dp(16), dp(10));
        GradientDrawable d = new GradientDrawable();
        d.setCornerRadius(dp(999));
        if (primary) { d.setColor(CTA_BG); } else { d.setColor(Color.TRANSPARENT); d.setStroke(dp(1), PILL_BORDER); }
        b.setBackground(d);
        b.setOnClickListener(onClick);
        return b;
    }

    private int statusBarHeight() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : dp(24);
    }

    private int navBarHeight() {
        int id = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
    }

    /**
     * Take a full-screen video down: off the screen, system bars back, and the
     * page told it is no longer full screen (without that last call the
     * player's own state stays stuck on "full screen"). Safe to call twice.
     */
    private void exitFullscreenVideo() {
        if (fullscreenView == null) return;
        if (rootFrame != null) rootFrame.removeView(fullscreenView);
        fullscreenView = null;
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .show(WindowInsetsCompat.Type.systemBars());
        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        // A video filling the screen owns Back first — it means "give me the
        // page back", not "leave the reading".
        if (fullscreenView != null) { exitFullscreenVideo(); return; }
        // Inside a reading, Back is "go back a page"; at the first page it
        // leaves — the same shape as the deck's own back guard.
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        /*
         * phoebe:browserfinished ON THE WAY OUT, EXACTLY ONCE.
         *
         * openExternalThenMarkRead waits for this before it marks a newsletter
         * read, so that the "done" animation lands when the person actually
         * closes the reading rather than the instant it opens. Without it the
         * listener waits forever and nothing is ever marked — the same bug the
         * iOS plugin's onDismiss note describes.
         */
        if (!finishedEventSent) {
            finishedEventSent = true;
            BibleBrowserPlugin.fireWindowEvent("phoebe:browserfinished");
        }
        handler.removeCallbacksAndMessages(null);
        if (web != null) {
            web.stopLoading();
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
