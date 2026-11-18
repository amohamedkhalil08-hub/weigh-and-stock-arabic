package com.hailsamar.stock;

import android.Manifest;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "FileDownloads",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class FileDownloadsPlugin extends Plugin {

    @PluginMethod
    public void saveFile(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && !hasRequiredPermissions()) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        saveFileInternal(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (!hasRequiredPermissions()) {
            call.reject("يلزم السماح بالوصول إلى الملفات لحفظ التصدير في مجلد التنزيلات.");
            return;
        }
        saveFileInternal(call);
    }

    private void saveFileInternal(PluginCall call) {
        String requestedName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String encoded = call.getString("dataBase64");
        if (requestedName == null || requestedName.trim().isEmpty() || encoded == null || encoded.isEmpty()) {
            call.reject("بيانات الملف المراد حفظه غير مكتملة.");
            return;
        }

        String fileName = requestedName.replace('/', '_').replace('\\', '_').replaceAll("\\p{Cntrl}", "_");
        byte[] bytes;
        try {
            bytes = Base64.decode(encoded, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("تعذر قراءة محتوى الملف.", error);
            return;
        }

        Uri savedUri = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                savedUri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (savedUri == null) throw new IllegalStateException("لم يتمكن النظام من إنشاء ملف التنزيلات.");

                try (OutputStream output = getContext().getContentResolver().openOutputStream(savedUri, "w")) {
                    if (output == null) throw new IllegalStateException("تعذر فتح الملف للكتابة.");
                    output.write(bytes);
                    output.flush();
                }

                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(savedUri, ready, null, null);
            } else {
                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloads.exists() && !downloads.mkdirs()) throw new IllegalStateException("تعذر إنشاء مجلد التنزيلات.");
                File outputFile = new File(downloads, fileName);
                try (FileOutputStream output = new FileOutputStream(outputFile)) {
                    output.write(bytes);
                    output.flush();
                }
                savedUri = Uri.fromFile(outputFile);
            }

            JSObject result = new JSObject();
            result.put("fileName", fileName);
            result.put("uri", savedUri.toString());
            call.resolve(result);
        } catch (Exception error) {
            if (savedUri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                getContext().getContentResolver().delete(savedUri, null, null);
            }
            call.reject("تعذر حفظ الملف في مجلد التنزيلات: " + error.getMessage(), error);
        }
    }
}
