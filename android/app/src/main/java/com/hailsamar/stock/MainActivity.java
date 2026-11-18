package com.hailsamar.stock;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileDownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
