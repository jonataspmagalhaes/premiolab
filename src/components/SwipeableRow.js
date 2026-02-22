import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { C, F } from '../theme';

function SwipeableRow(props) {
  var onDelete = props.onDelete;
  var enabled = props.enabled !== undefined ? props.enabled : true;
  var label = props.label || 'Excluir';
  var children = props.children;
  var swipeableRef = React.useRef(null);

  if (!enabled) {
    return children;
  }

  function renderRightActions(progress) {
    var translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [72, 0],
    });

    return (
      <View style={styles.rightActionsContainer}>
        <Animated.View style={[styles.deleteAction, { transform: [{ translateX: translateX }] }]}>
          <TouchableOpacity
            style={styles.deleteButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={function() {
              if (swipeableRef.current) {
                swipeableRef.current.close();
              }
              if (onDelete) onDelete();
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.deleteText}>{label}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  function handleSwipeOpen() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      accessibilityHint="Deslize para a esquerda para excluir"
    >
      {children}
    </Swipeable>
  );
}

export default SwipeableRow;

var styles = StyleSheet.create({
  rightActionsContainer: {
    width: 72,
  },
  deleteAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.red,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  deleteButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
  },
  deleteText: {
    fontFamily: F.body,
    fontSize: 10,
    color: '#fff',
    marginTop: 2,
  },
});
