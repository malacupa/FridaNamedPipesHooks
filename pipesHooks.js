// Global variables
//--------------------------------------------
//--------------------------------------------
const DEBUG = true;
const COLORS = true;
const OUTDIR = "C:\\FridaNamedPipesHooks-main\\pipe_files";
const ntdll = Process.getModuleByName('ntdll.dll');

var ntReadFileCalls = {};

const NtQueryObject = new NativeFunction(ntdll.getExportByName('NtQueryObject'), 'int', ['pointer', 'int', 'pointer', 'int', 'pointer']);
const ObjectNameInformation = 1;

// Shared functions
//--------------------------------------------
//--------------------------------------------

function log(str) {
    var date = new Date();
    var year = date.getFullYear().toString().slice(-2);
    var month = ("0" + (date.getMonth()+1)).slice(-2);
    var day = ("0" + date.getDate()).slice(-2);
    var hour = ("0" + date.getHours()).slice(-2);
    var minute = ("0" + date.getMinutes()).slice(-2);
    var secs = ("0" + date.getSeconds()).slice(-2);
    var milis = ("00" + date.getMilliseconds()).slice(-3);
    console.log(`${year}${month}${day}-${hour}:${minute}:${secs}.${milis} ${str}`);
}

function assignPipeHandle(handle, operation) {
    var fname = `${handle} (handle)`; 
    var type_info_buffer = Memory.alloc(1024);
    var res = NtQueryObject(ptr(handle), ObjectNameInformation, ptr(type_info_buffer), 1024, Memory.alloc(Process.pointerSize));
    if (res == 0) {
        var length = type_info_buffer.readU16();
        var bufferPtr = type_info_buffer.add(Process.pointerSize == 8 ? 8 : 4).readPointer();
        if (bufferPtr.isNull()) return false;
        fname = bufferPtr.readUtf16String(length / 2);
        if (fname.indexOf("\\Device\\NamedPipe\\") != 0) {
            if (DEBUG) log(`Not a pipe operation, skipping ${operation} file ${fname}`);
            return false;
        }
        if (fname.indexOf("\\Device\\NamedPipe\\LOCAL\\") == 0) {
            fname = fname.substr(24);
        } else {
            fname = fname.substr(18);
        }
    } else {
        return false;
    }
    return fname;
}

function dumpAndPrint(msg, msgLen) {
    if (msgLen <= 0) return "";
    var strDump;
    var dumpFileStamp = Date.now().toString();
    if (msgLen > 200) {
        var outFile = `${OUTDIR}\\${dumpFileStamp}.bin`;
        strDump = niceHexdump(msg) + `\n      Full message stored in file ${outFile}\n`;
        var file = new File(outFile, "wb");
        try {
            file.write(msg.readByteArray(msgLen));
        } catch (e) {
            strDump += `\n      Error writing to file: ${e}\n`;
        }
        file.close();
    } else {
        strDump = niceHexdump(msg, msgLen) + "\n";
    }
    
    return strDump;
}

function niceHexdump(buffer, length = 200) {
    if (length == 0) return "";
    const HEXD_OFFSET = "      ";
    const HEXD_OPTS = {offset: 0, length: length, header: true, ansi: COLORS};
    try {
        return "\n" + HEXD_OFFSET + hexdump(buffer, HEXD_OPTS).replaceAll("\n", "\n"+HEXD_OFFSET);
    } catch (e) {
        return `\n${HEXD_OFFSET}[Error reading memory at ${buffer}]`;
    }
}

// Hook functions
//--------------------------------------------

function hookNtWriteFile() {
    Interceptor.attach(ntdll.getExportByName('NtWriteFile'), {
        onEnter: function (args) {
            var handle = args[0];
            var lpBuffer = args[5];
            var nNumberOfBytesToWrite = args[6].toInt32();
            if (nNumberOfBytesToWrite <= 0) return;

            var fname = assignPipeHandle(handle, "write to");
            if (!fname) return;

            var strDump = dumpAndPrint(lpBuffer, nNumberOfBytesToWrite);
            if (DEBUG) {
                log(`NtWriteFile(handle= ${handle}, fname= ${fname}, len= ${nNumberOfBytesToWrite})` + strDump);
            } else {
                log(`Sending message over:    ${fname}` + strDump);
            }
        }
    });
}

function hookNtReadFile() {
    Interceptor.attach(ntdll.getExportByName('NtReadFile'), {
        onEnter: function (args) {
            this.handle = args[0];
            this.ioStatusBlock = args[4];
            this.buffer = args[5];
        },
        onLeave: function (retval) {
            var status = retval.toInt32();
            if (status !== 0) return; // STATUS_SUCCESS

            var handle = this.handle;
            var ioStatusBlock = this.ioStatusBlock;
            var lpBuffer = this.buffer;

            // Information field in IO_STATUS_BLOCK contains bytes read
            var numberOfBytesRead = ioStatusBlock.add(Process.pointerSize).readPointer().toUInt32();
            if (numberOfBytesRead <= 0) return;

            var fname = assignPipeHandle(handle, "read from");
            if (!fname) return;

            var strDump = dumpAndPrint(lpBuffer, numberOfBytesRead);
            if (DEBUG) {
                log(`NtReadFile(handle= ${handle}, fileName= ${fname}, read= ${numberOfBytesRead})` + strDump);
            } else {
                log(`Receiving message over:  ${fname}` + strDump);
            }
        }
    });
}

function hookNtCreateNamedPipeFile() {
    Interceptor.attach(ntdll.getExportByName('NtCreateNamedPipeFile'), {
        onEnter: function (args) {
            var objectAttributes = args[2];
            var objectNamePtr = objectAttributes.add(Process.pointerSize * 2).readPointer();
            var pipeName = "Unknown";
            if (!objectNamePtr.isNull()) {
                var length = objectNamePtr.readU16();
                var buffer = objectNamePtr.add(Process.pointerSize == 8 ? 8 : 4).readPointer();
                pipeName = buffer.readUtf16String(length / 2);
            }
            this.pipeName = pipeName;
            this.handlePtr = args[0];
        },
        onLeave: function (retval) {
            if (retval.toInt32() === 0) {
                var handle = this.handlePtr.readPointer();
                log(`New listening pipe (NtCreateNamedPipeFile): ${this.pipeName} (handle: ${handle})`);
            }
        }
    });
}

function hookNtCreateFile() {
    Interceptor.attach(ntdll.getExportByName('NtCreateFile'), {
        onEnter: function (args) {
            var objectAttributes = args[2];
            var objectNamePtr = objectAttributes.add(Process.pointerSize * 2).readPointer();
            var name = "Unknown";
            if (!objectNamePtr.isNull()) {
                var length = objectNamePtr.readU16();
                var buffer = objectNamePtr.add(Process.pointerSize == 8 ? 8 : 4).readPointer();
                name = buffer.readUtf16String(length / 2);
            }
            if (name.indexOf("\\Device\\NamedPipe\\") == 0) {
                this.isPipe = true;
                this.pipeName = name;
                this.handlePtr = args[0];
            }
        },
        onLeave: function (retval) {
            if (this.isPipe && retval.toInt32() === 0) {
                var handle = this.handlePtr.readPointer();
                log(`Opened pipe (NtCreateFile): ${this.pipeName} (handle: ${handle})`);
            }
        }
    });
}

// Main
//--------------------------------------------
//--------------------------------------------
log(`Storing long pipe messages to ${OUTDIR}`);

hookNtCreateNamedPipeFile();
hookNtCreateFile();
hookNtWriteFile();
hookNtReadFile();

log("Everything hooked now");
