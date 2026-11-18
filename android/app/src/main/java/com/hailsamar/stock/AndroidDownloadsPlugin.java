package com.hailsamar.stock;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "AndroidDownloads")
public class AndroidDownloadsPlugin extends Plugin {
    @PluginMethod
    public void saveFile(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String dataBase64 = call.getString("dataBase64");
        if (fileName == null || fileName.isEmpty() || dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("اسم الملف أو محتواه غير صالح");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(dataBase64, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("محتوى الملف غير صالح", error);
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveWithMediaStore(call, fileName, mimeType, bytes);
            } else {
                saveLegacy(call, fileName, mimeType, bytes);
            }
        } catch (Exception error) {
            call.reject("تعذر حفظ الملف في مجلد التنزيلات", error);
        }
    }

    private void saveWithMediaStore(PluginCall call, String fileName, String mimeType, byte[] bytes) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("تعذر إنشاء ملف في Downloads");
        try (OutputStream output = resolver.openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("تعذر فتح ملف Downloads");
            output.write(bytes);
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }

        ContentValues published = new ContentValues();
        published.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, published, null, null);
        resolve(call, fileName, uri.toString());
    }

    @SuppressWarnings("deprecation")
    private void saveLegacy(PluginCall call, String fileName, String mimeType, byte[] bytes) throws Exception {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!downloads.exists() && !downloads.mkdirs()) throw new IllegalStateException("تعذر إنشاء مجلد التنزيلات");
        File file = new File(downloads, fileName);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
        resolve(call, fileName, Uri.fromFile(file).toString());
    }

    private void resolve(PluginCall call, String fileName, String uri) {
        JSObject result = new JSObject();
        result.put("fileName", fileName);
        result.put("uri", uri);
        call.resolve(result);
    }
}
