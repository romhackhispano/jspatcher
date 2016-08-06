// soywiz@gmail.com
// References:
// - http://www.html5rocks.com/en/tutorials/file/dndfiles/
// - http://fileformats.archiveteam.org/wiki/IPS_(binary_patch_format)

function downloadFile(url: string, done: (data: Int8Array) => void) {
    var request = new XMLHttpRequest()
    request.responseType = 'arraybuffer';
    console.log('request');
    request.onload = function() {
        console.log('load');
        done(new Uint8Array(request.response));
    };
    request.onerror = function() {
        console.log('error');
    };
    request.open('GET', url);
    request.send();
}

var crc32 = function() {
    var crcTable = {};

    var makeCRCTable = function(){
        var c;
        var crcTable = [];
        for(var n =0; n < 256; n++){
            c = n;
            for(var k =0; k < 8; k++){
                c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            crcTable[n] = c;
        }
        return crcTable;
    }

    return function(data: Uint8Array) {
        var crcTable = crcTable || (crcTable = makeCRCTable());
        var crc = 0 ^ (-1);

        for (var i = 0; i < data.length; i++ ) {
            crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
        }

        return (crc ^ (-1)) >>> 0;
    };
}();

function readFile(file: File, done: (data: Uint8Array) => void) {
    var reader = new FileReader();
    reader.onload = function (e) {
        //console.log(e);
        done(new Uint8Array((e.target as any).result));
    };
    reader.onerror = function (e) {
        console.error(e);
    };
    reader.readAsArrayBuffer(file);
}

function applyPatch(originalData: Uint8Array, patchData: Uint8Array) {
    var patchedData = originalData.slice();
    var pos = 0;
    var EOF = 0x454F46; // EOF characters
    function available() { return patchData.length - pos; }
    function readBytes(count: number) {
        var out = patchData.subarray(pos, pos + count);
        pos += count;
        return out
    }

    function readString(count: number) { return String.fromCharCode.apply(null, readBytes(count)); }
    function readU24_be() { return (patchData[pos++] << 16) | (patchData[pos++] << 8) | (patchData[pos++] << 0); }
    function readU16_be() { return (patchData[pos++] << 8) | (patchData[pos++] << 0); }
    function readU8() { return (patchData[pos++]); }

    if (readString(5) != 'PATCH') throw 'Invalid patch data (MAGIC)';
    while (available() > 0) {
        var offset = readU24_be();
        if (offset == EOF) {
            if (available() > 0) {
                var truncatedLength = readU24_be();
                patchedData = patchedData.subarray(0, truncatedLength);
            }
            break;
        }

        if (offset > originalData.length) throw 'Invalid patch data (invalid offset : ' + offset + ' > ' + originalData.length + ')';

        var len = readU16_be();
        // RLE
        if (len == 0) {
            var len = readU16_be();
            var byte = readU8();
            patchedData.fill(byte, offset, offset + len);
        } else {
            var patch = readBytes(len);
            //console.log('chunk', offset, len, patch);
            patchedData.subarray(offset, offset + len).set(patch);
        }
    }

    return patchedData;
}

function generateDownload(data: Uint8Array, name: string, type: string = 'application/octet-stream') {
    var a = document.createElement("a");
    var file = new Blob([data], {type: type});
    a.href = URL.createObjectURL(file);
    (a as any).download = name;
    a.click();
}

function registerPatching(input: HTMLInputElement, patchUrl: string, generateName: string, workingCrcs: number[] = []) {
     input.addEventListener('change', function(e) {
        var file = input.files[0];
        readFile(file, function(originalData) {
            var hash = crc32(originalData);
            if (workingCrcs.indexOf(hash) < 0) {
                alert('Unsupported CRC!');
            } else {
                downloadFile(patchUrl, (patchData) => {
                    console.log('patching!');
                    var patchedData = applyPatch(originalData, patchData);
                    console.log('patched!');
                    generateDownload(patchedData, generateName, 'application/octet-stream');
                    //console.log(patchData);
                });
            }
        });
    }, false);
}
