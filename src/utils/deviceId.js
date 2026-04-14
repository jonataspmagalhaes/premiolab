var AsyncStorage = require('@react-native-async-storage/async-storage').default;

var DEVICE_KEY = '@premiolab_device_id';
var cachedId = null;

function generateUUID() {
  var chars = '0123456789abcdef';
  var sections = [8, 4, 4, 4, 12];
  var result = '';
  for (var s = 0; s < sections.length; s++) {
    if (s > 0) result += '-';
    for (var i = 0; i < sections[s]; i++) {
      result += chars.charAt(Math.floor(Math.random() * 16));
    }
  }
  return result;
}

async function getDeviceId() {
  if (cachedId) return cachedId;
  try {
    var stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored) {
      cachedId = stored;
      return stored;
    }
    var newId = generateUUID();
    await AsyncStorage.setItem(DEVICE_KEY, newId);
    cachedId = newId;
    return newId;
  } catch (e) {
    // Fallback: generate without persisting
    if (!cachedId) cachedId = generateUUID();
    return cachedId;
  }
}

module.exports = { getDeviceId: getDeviceId };
