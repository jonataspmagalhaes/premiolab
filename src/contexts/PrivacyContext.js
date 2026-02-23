import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { animateLayout } from '../utils/a11y';

var STORAGE_KEY = '@privacy_mode';

var PrivacyContext = createContext({});

export function usePrivacy() {
  return useContext(PrivacyContext);
}

export function PrivacyProvider(props) {
  var children = props.children;
  var _isPrivate = useState(false); var isPrivate = _isPrivate[0]; var setIsPrivate = _isPrivate[1];

  useEffect(function() {
    AsyncStorage.getItem(STORAGE_KEY).then(function(stored) {
      if (stored === 'true') {
        setIsPrivate(true);
      }
    }).catch(function() {});
  }, []);

  function togglePrivacy() {
    animateLayout();
    var next = !isPrivate;
    setIsPrivate(next);
    AsyncStorage.setItem(STORAGE_KEY, next ? 'true' : 'false').catch(function() {});
  }

  var value = {
    isPrivate: isPrivate,
    togglePrivacy: togglePrivacy,
  };

  return React.createElement(PrivacyContext.Provider, { value: value }, children);
}
