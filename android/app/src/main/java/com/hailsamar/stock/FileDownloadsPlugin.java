package com.hailsamar.stock;

import android.Manifest;
import android.content.Context;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.InputStream;
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

    @PluginMethod
    public void openPrintPreview(PluginCall call) {
        String uriValue = call.getString("uri");
        String fileName = call.getString("fileName", "فاتورة.pdf");
        if (uriValue == null || uriValue.trim().isEmpty()) {
            call.reject("لم يتم العثور على ملف PDF لعرض معاينة الطباعة.");
            return;
        }

        PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            call.reject("خدمة معاينة الطباعة غير متاحة على هذا الجهاز.");
            return;
        }

        Uri pdfUri = Uri.parse(uriValue);
        PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
            @Override
            public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
                if (cancellationSignal.isCanceled()) {
                    callback.onLayoutCancelled();
                    return;
                }
                PrintDocumentInfo info = new PrintDocumentInfo.Builder(fileName)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                    .build();
                callback.onLayoutFinished(info, true);
            }

            @Override
            public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellationSignal, WriteResultCallback callback) {
                if (cancellationSignal.isCanceled()) {
                    callback.onWriteCancelled();
                    return;
                }
                try (InputStream input = getContext().getContentResolver().openInputStream(pdfUri);
                     FileOutputStream output = new FileOutputStream(destination.getFileDescriptor())) {
                    if (input == null) throw new IllegalStateException("تعذر فتح ملف الفاتورة.");
                    byte[] buffer = new byte[16 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (cancellationSignal.isCanceled()) {
                            callback.onWriteCancelled();
                            return;
                        }
                        output.write(buffer, 0, count);
                    }
                    output.flush();
                    callback.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
                } catch (Exception error) {
                    callback.onWriteFailed(error.getMessage());
                }
            }
        };

        try {
            PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .build();
            printManager.print(fileName, adapter, attributes);
            call.resolve();
        } catch (Exception error) {
            call.reject("تعذر فتح معاينة الطباعة: " + error.getMessage(), error);
        }
    }
}
