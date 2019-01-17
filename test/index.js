const assert = require('assert');

const libdsmds = require('../index');

describe('test com port connect', () => {
  let device;
  it('should open port successfully', () => {
    const { error, data } = libdsmds.ICC_Reader_Open('AUTO');
    assert(error === 0);
    device = data.handle;
  });
  it('should power up cpu successfully', () => {
    const res = libdsmds.ICC_Reader_PowerOn(device, 1);
    assert(res.error === 0);
  });
  it('should get ic status successfully', () => {
    const res = libdsmds.ICC_Reader_GetStatus(device, 1);
    assert(res.error === 0);
  });
  it('should do apdu successfully', () => {
    const res = libdsmds.ICC_Reader_Application(device, 1, '00A404000E315041592E5359532E4444463031');
    assert(res.error === 0);
  });
  it('should power off cpu successfully', () => {
    const res = libdsmds.ICC_Reader_PowerOff(device, 1);
    assert(res.error === 0);
  });
  after(() => {
    libdsmds.ICC_Reader_Close(device);
  });
});

