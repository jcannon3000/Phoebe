package app.withphoebe.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.reflect.Method;
import java.util.List;

/**
 * IS PUSH EVEN POSSIBLE ON THIS BUILD?
 *
 * PushNotifications.register() on Android goes straight to
 * FirebaseMessaging.getInstance(), which throws IllegalStateException
 * ("Default FirebaseApp is not initialized in this process") when there is no
 * google-services.json. The throw happens on Capacitor's own plugin thread, so
 * it is a FATAL EXCEPTION that kills the process — a JS try/catch around the
 * call cannot see it, let alone stop it.
 *
 * Measured on the emulator 2026-09-08: grant the notification permission, and
 * the app crashes on the next register() and keeps crashing on every launch
 * that reaches it. Android's own words for it were "Phoebe keeps stopping".
 * Every Android tester would have hit this within a minute of installing.
 *
 * So the web layer asks first. `isAvailable` reports whether a default
 * FirebaseApp actually initialised in this process — which is true exactly
 * when google-services.json is present and valid, and false otherwise. The
 * day the owner drops that file into android/app/, this starts returning true
 * and push begins working with no code change anywhere.
 *
 * Deliberately its own tiny plugin rather than a branch inside another: it
 * answers one question, and the answer has to come from native.
 *
 * REFLECTION, NOT AN IMPORT. FirebaseApp lives in firebase-common, which is a
 * transitive dependency of the push plugin's own module — present at RUNTIME
 * but not on this module's compile classpath (`cannot find symbol`). Adding
 * `implementation "com.google.firebase:firebase-common"` here would fix the
 * compile and pin a Firebase version this app has no other reason to care
 * about. Reflection asks the same question of whatever is actually loaded,
 * and answers false when the class is absent entirely — which is the correct
 * answer for a build with no Firebase in it.
 */
@CapacitorPlugin(name = "PhoebePush")
public class PhoebePushPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean ok = false;
        try {
            // getApps rather than getInstance: getInstance THROWS when there is
            // no default app, which is the very thing being tested for.
            Class<?> firebaseApp = Class.forName("com.google.firebase.FirebaseApp");
            Method getApps = firebaseApp.getMethod("getApps", android.content.Context.class);
            Object apps = getApps.invoke(null, getContext());
            ok = apps instanceof List && !((List<?>) apps).isEmpty();
        } catch (Throwable t) {
            // A missing class or any other surprise means push is not
            // available. Never rethrow — the whole point is that a throw here
            // is what takes the app down.
            ok = false;
        }
        ret.put("available", ok);
        call.resolve(ret);
    }
}
