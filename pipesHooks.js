// Global variables
//--------------------------------------------
//--------------------------------------------
const DEBUG = true;
const COLORS = true;
const OUTDIR = "C:\\FridaNamedPipesHooks\\pipe_files";
var createFileCalls = {};
var readFileCalls = {};
var createPipeCalls = {};
var handles = {};

// Shared functions
//--------------------------------------------
//--------------------------------------------

function assignPipeHandle(handle, operation) {
    var fname = `${handle} (handle)`; // fallback to handle number at least
    if (handle in handles) {
        fname = handles[handle];
        if (fname.length < 9 || fname.substring(0, 9) != '\\\\.\\pipe\\')
        {
            if (DEBUG) console.log(`Not a write to pipe, skipping ${operation} file ${fname}`);
            return false;
        }
    }
    return fname;
}

function dumpAndPrint(msg, msgLen) {
    var strDump;
    var dumpFileStamp = Date.now().toString();
    if (msgLen > 200) {
        var outFile = `${OUTDIR}\\${dumpFileStamp}.bin`;
        strDump = niceHexdump(msg) + `\n      Full message stored in file ${outFile}\n`;
        var file = new File(outFile, "wb");
        file.write(msg.readByteArray(msgLen));
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
    return "\n" + HEXD_OFFSET + hexdump(buffer, HEXD_OPTS).replaceAll("\n", "\n"+HEXD_OFFSET);
}

// get type, useful when debugging Frida stuff
// source: https://stackoverflow.com/questions/1249531/how-to-get-a-javascript-objects-class
function getNativeClass(obj) {
  if (typeof obj === "undefined") return "undefined";
  if (obj === null) return "null";
  return Object.prototype.toString.call(obj).match(/^\[object\s(.*)\]$/)[1];
}

// logs in GMT+0 for some reason, hence using Python version
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

// Hook functions
//--------------------------------------------
//--------------------------------------------
function createFileHookOnEnterVariant (variant) {
    return function(args) {
        if (variant[variant.length - 1] == "A") {
            createFileCalls[this.threadId] = args[0].readCString();
        } else {
            createFileCalls[this.threadId] = args[0].readUtf16String();
        }
    };
};
function createFileHookOnLeaveVariant(variant) {
    return function (retval) {
        var fname = createFileCalls[this.threadId];
        var handle = "0x" + retval.toInt32().toString(16);
        if (DEBUG) log(`${variant}(lpFileName= ${fname}) handle= ${handle}`);
        handles[handle] = fname;
        // fyi the below line cannot be used because if you call both CreateFileA and CreateFileW you end up with same handle and this leads to wrong behavior as OnLeave for first function would delete handle but it would be missing in second OnLeave call
        //delete createFileCalls[this.threadId];
    };
};


function createNamedPipeHookOnEnterVariant(variant) {
    return function(args) {
        var pipeName = variant[variant.length - 1] == "A" ? args[0].readCString() : args[0].readUtf16String();
        createPipeCalls[this.threadId] = [pipeName, args[1], args[2], args[3], args[4], args[5], args[6]];
        try {
            // this is optional argument, may get exception
            createPipeCalls[this.threadId] = createPipeCalls[this.threadId].concat([args[7]]);
        } catch {}
    };
}
function createNamedPipeHookOnLeaveVariant(variant) {
    return function (retval) {
        var args = createPipeCalls[this.threadId];
        var fname = args[0];
        var dwOpenMode = Number(args[1]);
        var dwOpenModeStr = [];
        if (dwOpenMode & 1) dwOpenModeStr.push("INBOUND");
        if (dwOpenMode & 2) dwOpenModeStr.push("OUTBOUND");
        if (dwOpenMode & 3) dwOpenModeStr.push("DUPLEX");
        if (dwOpenMode & 0x00080000) dwOpenModeStr.push("FIRST_PIPE_INSTANCE");
        if (dwOpenMode & 0x80000000) dwOpenModeStr.push("WRITE_THROUGH");
        if (dwOpenMode & 0x40000000) dwOpenModeStr.push("OVERLAPPED");
        if (dwOpenMode & 0x40000) dwOpenModeStr.push("WRITE_DAC");
        if (dwOpenMode & 0x80000) dwOpenModeStr.push("WRITE_OWNER");
        if (dwOpenMode & 0x1000000) dwOpenModeStr.push("ACCESS_SYSTEM_SECURITY");
        dwOpenModeStr = dwOpenModeStr.join(" | ")
        
        var dwPipeMode = Number(args[2]);
        var dwPipeModeStr = [];
        if (dwPipeMode == 0) {
            dwPipeModeStr.push("TYPE_BYTE");
            dwPipeModeStr.push("READMODE_BYTE");
            dwPipeModeStr.push("PIPE_WAIT");
            dwPipeModeStr.push("ACCEPT_REMOTE_CLIENTS");
        }
        if (dwPipeMode & 4) dwPipeModeStr.push("TYPE_MESSAGE");
        if (dwPipeMode & 2) dwPipeModeStr.push("READMODE_MESSAGE");
        if (dwPipeMode & 1) dwPipeModeStr.push("NOWAIT");
        if (dwPipeMode & 8) dwPipeModeStr.push("REJECT_REMOTE_CLIENTS");
        dwPipeModeStr = dwPipeModeStr.join(" | ")
        
        var nMaxInstancesStr = Number(args[3]) == 255 ? "UNLIMITED" : args[3];
        
        var securityAttributes = args.length > 6 ? args[6] : "null";
        var handle = "0x" + retval.toInt32().toString(16);
        if (DEBUG) {
            log(
                `${variant}(lpFileName= ${fname}, dwOpenMode= ${dwOpenModeStr}, dwPipeMode= ${dwPipeModeStr}, nMaxInstances= ${nMaxInstancesStr}, nOutBufferSize= ${args[4]}, nInBufferSize= ${args[5]}, nDefaultTimeOut= ${args[6]}, lpSecurityAttributes= ${securityAttributes}) handle= ${handle}`
            );
        } else {
            log(`New listening pipe:      ${fname}`);
        }
        handles[handle] = fname;
    };
};

function writeFileHookOnEnterVariant(variant) {
    return function(args) {
        var handle = args[0];
        var lpBuffer = args[1];
        var nNumberOfBytesToWrite = Number(args[2]);
        var fname = assignPipeHandle(handle, "write to");
        if ( !fname) return;
        
        var strDump = dumpAndPrint(lpBuffer, nNumberOfBytesToWrite);
        if (DEBUG) {
            log(`${variant}(fname= ${fname}, nNumberOfBytesToWrite= ${nNumberOfBytesToWrite}, lpBuffer= ${lpBuffer}` + strDump);
        } else {
            log(`Sending message over:    ${fname}` + strDump);
        }
    }
};

function readFileHookOnEnterVariant(variant) {
    return function (args) {
        readFileCalls[this.threadId] = [args[0], args[1], args[3]];
    };
};
function readFileHookOnLeaveVariant(variant) {
    return function (retval) {
        var handle = readFileCalls[this.threadId][0];
        var lpBuffer = readFileCalls[this.threadId][1];
        var lpNumberOfBytesRead = readFileCalls[this.threadId][2].readU32();
        var fname = assignPipeHandle(handle, "read from");
        if ( !fname) return;
        
        var strDump = dumpAndPrint(lpBuffer, lpNumberOfBytesRead);
        if (DEBUG) {
            log(`${variant}(fileName= ${fname}, read= ${lpNumberOfBytesRead})` + strDump);
        } else {
            log(`Receiving message over:  ${fname}` + strDump);
        }
    };
};

// Main
//--------------------------------------------
//--------------------------------------------
log(`Storing long pipe messages to ${OUTDIR}`);

["CreateFileA", "CreateFileW", "CreateFile2"].forEach(variant => {
    Interceptor.attach(Module.getExportByName('kernel32.dll', variant), {
        onEnter: createFileHookOnEnterVariant(variant),
        onLeave: createFileHookOnLeaveVariant(variant)
    });
    if (DEBUG) log(`Hooked ${variant}`);
});

["CreateNamedPipeA", "CreateNamedPipeW" ].forEach(variant => {
    Interceptor.attach(Module.getExportByName('kernel32.dll', variant), {
        onEnter: createNamedPipeHookOnEnterVariant(variant),
        onLeave: createNamedPipeHookOnLeaveVariant(variant)
    });
    if (DEBUG) log(`Hooked ${variant}`);
});

["WriteFile", "WriteFileEx"].forEach(variant => {
    Interceptor.attach(Module.getExportByName('kernel32.dll', variant), {
        onEnter: writeFileHookOnEnterVariant(variant)
    });
    if (DEBUG) log(`Hooked ${variant}`);
});

["ReadFile", "ReadFileEx"].forEach(variant => {
    Interceptor.attach(Module.getExportByName('kernel32.dll', variant), {
        onEnter: readFileHookOnEnterVariant(variant),
        onLeave: readFileHookOnLeaveVariant(variant)
    });
    if (DEBUG) log(`Hooked ${variant}`);
});
log("Everything hooked now");
