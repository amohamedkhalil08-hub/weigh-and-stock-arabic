package com.hailsamar.stock;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AndroidDownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
