import SliderBar from "./SliderBar"
import SubTabs from "./SubTabs"
import CategoryTabs from "./CategoryTabs"


export default function BottomPanel(){
  return (
    <div className="bottomPanel">

      <SliderBar />

      <SubTabs />

      <CategoryTabs />

    </div>
  )
}