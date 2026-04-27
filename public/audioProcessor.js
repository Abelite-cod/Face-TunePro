class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]

    if (input && input[0]) {
      const channelData = input.map(channel => channel.slice(0))

      this.port.postMessage(channelData)
    }

    return true
  }
}

registerProcessor("pcm-processor", PCMProcessor)