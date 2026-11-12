// The running course's card, on whatever page the user is (courses span the
// canvas, the home page and Global Settings).

import type React from "react";
import CourseCard from "./CourseCard";
import { useCourse } from "./useCourse";

const CourseRunner: React.FC = () => {
  const course = useCourse();
  return course ? <CourseCard course={course} /> : null;
};

export default CourseRunner;
