class Media {

  source = null
  type = "camera"

  async camera(video){

    const stream = await navigator.mediaDevices.getUserMedia({
      video:true 
    })

    video.srcObject = stream
    this.source = video
    this.type = "camera"
  }

  async image(img){

    this.source = img
    this.type = "image"
  }

  async video(video){

    this.source = video
    this.type = "video"
  }

  get(){
    return this.source
  }

}

export default new Media()