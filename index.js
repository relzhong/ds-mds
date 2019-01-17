const ffi = require('ffi');
const ref = require('ref');
const path = require('path');
const hardware = {};
const stack = require('callsite');
const Decimal = require('decimal.js');
const R = require('ramda');

function hazardous(location) {
  const electronRegex = /[\\/]electron\.asar[\\/]/;
  const asarRegex = /^(?:^\\\\\?\\)?(.*\.asar)[\\/](.*)/;
  /* convert path when use electron asar unpack
   */
  if (!path.isAbsolute(location)) {
    return location;
  }

  if (electronRegex.test(location)) {
    return location;
  }

  const matches = asarRegex.exec(location);
  if (!matches || matches.length !== 3) {
    return location;
  }

  /* Skip monkey patching when an electron method is in the callstack. */
  const skip = stack().some(site => {
    const siteFile = site.getFileName();
    return /^ELECTRON_ASAR/.test(siteFile) || electronRegex.test(siteFile);
  });

  return skip ? location : location.replace(/\.asar([\\/])/, '.asar.unpacked$1');
}

/**
   * 字符串转Hex Buffer
   * @param {String} req 字符 { 0 ~ F }
   * @param {Number} length 长度, 自动补长
   * @param {Number} type 拼接方式 { 0: 右边补0, 1: 左边补0 }
   * @return {Buffer} res
   */
function str2Hex(req, length, type) {
  if (length) {
    if (type) {
      // 左边补0
      if (req.length % 2) {
        req = '0' + req;
      }
      const surplusNum = length * 2 - req.length;
      const surplus = R.reduce(R.concat, '', R.repeat('0', surplusNum));
      req = R.splitEvery(2, surplus + req);

    } else {
      // 默认右边补0
      if (req.length % 2) {
        req = req + '0';
      }
      const surplusNum = length * 2 - req.length;
      const surplus = R.reduce(R.concat, '', R.repeat('0', surplusNum));
      req = R.splitEvery(2, req + surplus);
    }
  } else {
    if (req.length % 2) {
      req = req + '0';
    }
    req = R.splitEvery(2, req);
  }

  let buf = Buffer.from('');
  req.forEach(i => { buf = Buffer.concat([ buf, Buffer.alloc(1, new Decimal('0x' + i).toNumber()) ]); });
  return buf;
}

/**
       * Hex Buffer转字符串
       * @param {Buffer} req 字符
       * @return {String} res
       */
function hex2Str(req) {
  let dec = '';
  for (let i = 0; i < req.length; i++) {
    let d = new Decimal(req.readUIntBE(i, 1)).toHex().slice(2, 4)
      .toUpperCase();
    d = d.length % 2 ? '0' + d : '' + d;
    dec = dec + d;
  }
  return dec;
}

const libdsmds = ffi.Library(hazardous(path.join(__dirname, './lib/F4_MDS')), {
  Device_Get_info: [ 'int', [ 'int', 'pointer' ]],
  SerialNumber_Read: [ 'int', [ 'int', 'pointer' ]],
  Magnetic_Get_Track123Data: [ 'int', [ 'int', 'pointer' ]],
  Icc_TrackTimeOut: [ 'int', [ 'int', 'int' ]],
  icc_type_set: [ 'int', [ 'int', 'char' ]],
  icc_power_off: [ 'int', [ 'int' ]],
  icc_rdpass: [ 'int', [ 'int', 'pointer' ]],
  icc_password: [ 'int', [ 'int', 'char', 'pointer', 'char' ]],
  icc_changc: [ 'int', [ 'int', 'char', 'pointer', 'char' ]],
  icc_read: [ 'int', [ 'int', 'char', 'pointer', 'char' ]],
  icc_write: [ 'int', [ 'int', 'char', 'string', 'int', 'int' ]],
  icc_Password_Read: [ 'int', [ 'int', 'char', 'pointer' ]],
  icc_rdbaohu: [ 'int', [ 'int', 'pointer', 'char', 'char' ]],
  icc_wdbaohu: [ 'int', [ 'int', 'string', 'char', 'char' ]],
  ic_rdbaohu: [ 'int', [ 'int', 'pointer', 'int', 'int' ]],
  ic_wdbaohu: [ 'int', [ 'int', 'string', 'int', 'int' ]],
  icc_Power_on: [ 'int', [ 'int' ]],
  icc_testcard: [ 'int', [ 'int' ]],
  ICC_Reader_Open: [ 'int', [ 'string' ]],
  ICC_Reader_Close: [ 'int', [ 'int' ]],
  ICC_Reader_PowerOn: [ 'int', [ 'int', 'char', 'pointer' ]],
  ICC_Reader_PowerOff: [ 'int', [ 'int', 'char' ]],
  ICC_Reader_GetStatus: [ 'int', [ 'int', 'char' ]],
  ICC_Reader_Application: [ 'int', [ 'int', 'char', 'int', 'string', 'pointer' ]],
  ICC_Reader_Libinfo: [ 'int', [ 'pointer' ]],
  ICC_Reader_GetDevID: [ 'int', [ 'int', 'pointer' ]],
});

hardware.ICC_Reader_Open = port => {
  try {
    const handle = libdsmds.ICC_Reader_Open(port);
    if (handle < 0) {
      return { error: handle };
    }
    return { error: 0, data: { handle } };
  } catch (e) {
    return { error: -1 };
  }
};

hardware.ICC_Reader_Close = handle => {
  try {
    const res = libdsmds.ICC_Reader_Close(handle);
    if (res === 0) {
      return { error: 0 };
    }
    return { error: -1 };
  } catch (e) {
    return { error: -1 };
  }
};

hardware.ICC_Reader_GetStatus = (handle, slot) => {
  try {
    const res = libdsmds.ICC_Reader_GetStatus(handle, slot);
    return { error: res };
  } catch (e) {
    return { error: -1 };
  }
};

hardware.ICC_Reader_PowerOn = (handle, slot) => {
  try {
    const DataBuffer = new Buffer(1000 * ref.types.uchar.size);
    const res = libdsmds.ICC_Reader_PowerOn(handle, slot, DataBuffer);
    if (res > 0) {
      const Response = ref.reinterpret(DataBuffer, res);
      return { error: 0, data: { Response } };
    }
    return { error: res };
  } catch (e) {
    return { error: -1 };
  }
};

hardware.ICC_Reader_PowerOff = (handle, slot) => {
  try {
    const res = libdsmds.ICC_Reader_PowerOff(handle, slot);
    return { error: res };
  } catch (e) {
    return { error: -1 };
  }
};

hardware.ICC_Reader_GetDevID = handle => {
  try {
    const DataBuffer = ref.alloc(ref.types.uchar);
    const res = libdsmds.ICC_Reader_GetDevID(handle, DataBuffer);
    if (res === 0) {
      const DevID = DataBuffer.deref();
      return { error: 0, data: { DevID } };
    }
    return { error: res };
  } catch (e) {
    return { error: -1 };
  }
};

hardware.ICC_Reader_Application = (handle, slot, sbuff) => {
  try {
    const inData = str2Hex(sbuff);
    const data = new Buffer(1000 * ref.types.uchar.size);
    data.type = ref.types.uchar;
    const res = libdsmds.ICC_Reader_Application(handle, slot, inData.length, inData, data);
    if (res > 0) {
      const Response_APDU = ref.reinterpret(data, res);
      return { error: 0, data: { Response_APDU: hex2Str(Response_APDU) } };
    }
    return { error: res };
  } catch (e) {
    return { error: -1 };
  }
};

module.exports = hardware;
