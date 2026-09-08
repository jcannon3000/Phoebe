package app.withphoebe.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoebeAudioPlugin.class);
        // The in-app reader. Registered by NAME "BibleBrowser" (see the
        // plugin), which is the same name the iOS twin uses — native-shell.ts
        // resolves it cross-platform and needs no branch.
        registerPlugin(BibleBrowserPlugin.class);
        // Reports whether Firebase actually initialised, so the web layer can
        // avoid a register() that would take the process down. See the plugin.
        registerPlugin(PhoebePushPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
