package app.withphoebe.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoebeAudioPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
