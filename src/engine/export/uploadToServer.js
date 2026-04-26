// export async function uploadToServer(blob, { onStage } = {}) {
//   try {
//     onStage?.("uploading")

//     const formData = new FormData()
//     formData.append("video", blob, "recording.webm")

//     const res = await fetch(
//       "https://face-tunepro.onrender.com/export",
//       {
//         method: "POST",
//         body: formData
//       }
//     )

//     if (!res.ok) {
//       throw new Error("Server export failed")
//     }

//     onStage?.("processing")

//     const fileBlob = await res.blob()

//     onStage?.("downloading")

//     const url = URL.createObjectURL(fileBlob)

//     const a = document.createElement("a")
//     a.href = url
//     a.download = "face-edit.mp4"
//     a.click()

//     setTimeout(() => {
//       URL.revokeObjectURL(url)
//       onStage?.("done")
//     }, 3000)

//   } catch (err) {
//     console.error("❌ uploadToServer failed:", err)
//     onStage?.(null)
//     throw err
//   }
// }