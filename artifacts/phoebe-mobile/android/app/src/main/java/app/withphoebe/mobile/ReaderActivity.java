package app.withphoebe.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

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
 * Deliberately NOT a line-for-line port of the 3,200-line iOS controller. This
 * is the contract the web layer actually depends on: load a saved page or a
 * URL, keep a Done button pinned (the reason the iOS side stopped using
 * SFSafariViewController at all), carry the office pill when asked, and fire
 * phoebe:browserfinished on the way out so a newsletter marks read when it is
 * CLOSED rather than when it is opened. Reader-mode restyling, the Previous
 * menu, deep-link scrolling and the veil are iOS-only for now.
 */
public class ReaderActivity extends Activity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_SAVED_HTML = "savedHtml";
    public static final String EXTRA_OFFICE_CHROME = "officeChrome";
    public static final String EXTRA_OFFICE_TITLE = "officeTitle";
    public static final String EXTRA_SLIDE_LABEL = "slideLabel";
    public static final String EXTRA_SECTION_LABEL = "sectionLabel";
    public static final String EXTRA_BACK_CHROME = "backChrome";

    // The deck's own tokens (capacitor.config.ts android.backgroundColor and
    // index.css --oh-ink / --ot-sage), so the reader reads as the same app.
    private static final int BG = Color.parseColor("#091A10");
    private static final int WARM = Color.parseColor("#F0EDE6");
    private static final int SAGE = Color.parseColor("#8FAF96");
    private static final int PILL_BG = Color.parseColor("#152B1D");
    private static final int PILL_BORDER = Color.parseColor("#2E6B40");
    private static final int CTA_BG = Color.parseColor("#2D5E3F");

    private WebView web;
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

        Bundle x = getIntent().getExtras();
        final String url = x != null ? x.getString(EXTRA_URL, "") : "";
        final String savedHtml = x != null ? x.getString(EXTRA_SAVED_HTML, null) : null;
        final boolean officeChrome = x != null && x.getBoolean(EXTRA_OFFICE_CHROME, false);
        final boolean backChrome = x != null && x.getBoolean(EXTRA_BACK_CHROME, false);
        final String officeTitle = x != null ? x.getString(EXTRA_OFFICE_TITLE, "") : "";
        final String slideLabel = x != null ? x.getString(EXTRA_SLIDE_LABEL, "") : "";
        final String sectionLabel = x != null ? x.getString(EXTRA_SECTION_LABEL, "") : "";

        if ((url == null || url.isEmpty()) && savedHtml == null) { finish(); return; }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        root.addView(column, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        column.addView(buildTopBar(officeTitle, backChrome), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(dp(36), dp(36));
        sp.gravity = Gravity.CENTER;
        root.addView(spinner, sp);

        web = new WebView(this);
        web.setBackgroundColor(BG);
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
        // Follow the app's dark ground where the page supports it, rather than
        // flashing white between the deck and the reading.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            s.setAlgorithmicDarkeningAllowed(true);
        }
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
            public void onPageFinished(WebView v, String u) { spinner.setVisibility(View.GONE); }
        });
        LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        column.addView(web, wp);

        if (officeChrome) {
            root.addView(buildOfficePill(slideLabel, sectionLabel));
        }

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

    private View buildTopBar(String title, boolean backChrome) {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BG);
        // The status bar is drawn over by the system; pad below it so Done is
        // never under the clock.
        int top = dp(14) + statusBarHeight();
        bar.setPadding(dp(14), top, dp(14), dp(10));

        TextView done = new TextView(this);
        done.setText(backChrome ? "Back" : "Done");
        done.setTextColor(WARM);
        done.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        done.setTypeface(Typeface.DEFAULT_BOLD);
        // A text button still needs a finger-sized box.
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

        // A spacer the same width as Done, so the title sits centred rather
        // than pushed right by the button (the office header's 1fr/auto/1fr).
        View spacer = new View(this);
        bar.addView(spacer, new LinearLayout.LayoutParams(dp(56), 1));
        return bar;
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

    @Override
    public void onBackPressed() {
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
        if (web != null) {
            web.stopLoading();
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
