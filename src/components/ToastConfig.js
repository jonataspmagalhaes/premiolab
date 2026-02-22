import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import { C, F, SIZE } from '../theme';

function SuccessToast(props) {
  var text1 = props.text1 || '';
  var text2 = props.text2 || '';
  return (
    <View style={styles.container}>
      <View style={[styles.card, styles.successCard]}>
        <View style={styles.indicator} />
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>{text1}</Text>
          {text2 ? <Text style={styles.message} numberOfLines={2}>{text2}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function ErrorToast(props) {
  var text1 = props.text1 || '';
  var text2 = props.text2 || '';
  return (
    <View style={styles.container}>
      <View style={[styles.card, styles.errorCard]}>
        <View style={[styles.indicator, styles.indicatorError]} />
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>{text1}</Text>
          {text2 ? <Text style={styles.message} numberOfLines={2}>{text2}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function InfoToast(props) {
  var text1 = props.text1 || '';
  var text2 = props.text2 || '';
  return (
    <View style={styles.container}>
      <View style={[styles.card, styles.infoCard]}>
        <View style={[styles.indicator, styles.indicatorInfo]} />
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>{text1}</Text>
          {text2 ? <Text style={styles.message} numberOfLines={2}>{text2}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function UndoToast(props) {
  var text1 = props.text1 || '';
  var text2 = props.text2 || '';
  var onUndo = props.props && props.props.onUndo;
  return (
    <View style={styles.container}>
      <View style={[styles.card, styles.undoCard]}>
        <View style={[styles.indicator, styles.indicatorUndo]} />
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>{text1}</Text>
          {text2 ? <Text style={styles.message} numberOfLines={2}>{text2}</Text> : null}
        </View>
        {onUndo ? (
          <TouchableOpacity style={styles.undoBtn} onPress={function() { onUndo(); Toast.hide(); }}>
            <Text style={styles.undoBtnText}>Desfazer</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

var toastConfig = {
  success: function(props) { return <SuccessToast text1={props.text1} text2={props.text2} />; },
  error: function(props) { return <ErrorToast text1={props.text1} text2={props.text2} />; },
  info: function(props) { return <InfoToast text1={props.text1} text2={props.text2} />; },
  undo: function(props) { return <UndoToast text1={props.text1} text2={props.text2} props={props.props} />; },
};

export default toastConfig;

var styles = StyleSheet.create({
  container: {
    width: '92%',
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardSolid,
    borderRadius: SIZE.radius,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  successCard: {
    borderColor: C.green,
  },
  errorCard: {
    borderColor: C.red,
  },
  infoCard: {
    borderColor: C.accent,
  },
  indicator: {
    width: 4,
    height: 28,
    borderRadius: 2,
    backgroundColor: C.green,
    marginRight: 12,
  },
  indicatorError: {
    backgroundColor: C.red,
  },
  indicatorInfo: {
    backgroundColor: C.accent,
  },
  undoCard: {
    borderColor: C.yellow,
  },
  indicatorUndo: {
    backgroundColor: C.yellow,
  },
  undoBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.yellow,
    borderRadius: 8,
    marginLeft: 10,
  },
  undoBtnText: {
    fontFamily: F.display,
    fontSize: 13,
    color: '#000',
  },
  content: {
    flex: 1,
  },
  title: {
    fontFamily: F.display,
    fontSize: 14,
    color: C.text,
  },
  message: {
    fontFamily: F.body,
    fontSize: 12,
    color: C.sub,
    marginTop: 2,
  },
});
