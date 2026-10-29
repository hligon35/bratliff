import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

/** Native build shell only. No routes, account actions, or product screens yet. */
export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Text style={styles.brand}>Jackrabbit Punkin</Text>
        <Text style={styles.subtitle}>Publishing LLC</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1628' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  brand: { color: '#d4ad55', fontSize: 27, textAlign: 'center', fontWeight: '700' },
  subtitle: { color: '#ffffff', fontSize: 14, marginTop: 8, textAlign: 'center', letterSpacing: 2 },
});
