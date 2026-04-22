export default function Timeline(){

  const frames = new Array(12).fill(0)

  return (
    <div className="timeline">
      <div className="frames">
        {frames.map((_,i)=>(
          <div key={i} className="frame"/>
        ))}
      </div>
    </div>
  )
}