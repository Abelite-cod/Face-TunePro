import SliderBar from "./SliderBar"
import SubTabs from "./SubTabs"
import CategoryTabs from "./CategoryTabs"
import DoneCancel from "./DoneCancel"

export default function BottomPanel(){
  return (
    <div className="bottomPanel">

      <SliderBar />

      <SubTabs />

      <CategoryTabs />

      <DoneCancel />

    </div>
  )
}