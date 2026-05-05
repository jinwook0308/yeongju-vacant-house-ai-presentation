/**
 * sample-data.js
 * 영주시 공공형 빈집 활용 플랫폼 - 더미 샘플 데이터
 * 모든 데이터는 영주시 기준으로 구성되어 있습니다.
 * 추후 Python 백엔드 API 연동 시 이 파일을 API 응답 형태로 교체하세요.
 */

// ============================================================
// 영주시 읍면동 목록
// ============================================================
const YEONGJU_DISTRICTS = [
  { id: 'punggi', name: '풍기읍', type: 'eup' },
  { id: 'sunheung', name: '순흥면', type: 'myeon' },
  { id: 'anjeong', name: '안정면', type: 'myeon' },
  { id: 'bonghyeon', name: '봉현면', type: 'myeon' },
  { id: 'isu', name: '이산면', type: 'myeon' },
  { id: 'pyeongeunsam', name: '평은면', type: 'myeon' },
  { id: 'munsu', name: '문수면', type: 'myeon' },
  { id: 'jangsu', name: '장수면', type: 'myeon' },
  { id: 'dansan', name: '단산면', type: 'myeon' },
  { id: 'buseok', name: '부석면', type: 'myeon' },
  { id: 'yeongju', name: '영주동', type: 'dong' },
  { id: 'hyucheon', name: '휴천동', type: 'dong' },
  { id: 'gaheung', name: '가흥동', type: 'dong' },
  { id: 'sangsang', name: '상망동', type: 'dong' },
  { id: 'hangangno', name: '하망동', type: 'dong' },
];

// ============================================================
// 상태 등급 정의
// ============================================================
const CONDITION_GRADES = {
  A: { label: 'A등급', description: '바로 활용 가능', color: '#2e7d32', bgColor: '#e8f5e9' },
  B: { label: 'B등급', description: '청소·소규모 보수 후 가능', color: '#f57c00', bgColor: '#fff3e0' },
  C: { label: 'C등급', description: '대수선 필요', color: '#c62828', bgColor: '#ffebee' },
  D: { label: 'D등급', description: '운영 불가', color: '#616161', bgColor: '#f5f5f5' },
};

// ============================================================
// 검토 상태 정의
// ============================================================
const REVIEW_STATUS = {
  pending:    { label: '검토 중',    color: '#1565c0', bgColor: '#e3f2fd' },
  repair:     { label: '보수 필요',  color: '#e65100', bgColor: '#fff8e1' },
  approved:   { label: '승인 완료',  color: '#2e7d32', bgColor: '#e8f5e9' },
  rejected:   { label: '반려',       color: '#b71c1c', bgColor: '#ffebee' },
  submitted:  { label: '신청 완료',  color: '#6a1b9a', bgColor: '#f3e5f5' },
};

// ============================================================
// 운영 가능 유형 정의
// ============================================================
const OPERATION_TYPES = {
  lodging:      { label: '숙박 가능',       icon: '🏠' },
  longterm:     { label: '장기체류형',       icon: '📅' },
  experience:   { label: '체험공간형',       icon: '🌿' },
  review_needed:{ label: '추가 검토 필요',   icon: '🔍' },
};

// ============================================================
// 영주시 승인 빈집 목록 데모 데이터
// ============================================================
const VACANT_HOUSE_LIST = [
  {
    id: 'house-001',
    name: '풍기읍 소백산 자락 한옥',
    districtId: 'punggi',
    districtName: '풍기읍',
    address: '풍기읍 산책로 일대',
    description: '소백산 접근성이 좋고 마당과 한옥 구조가 남아 있어 체류형 숙박으로 활용하기 좋은 빈집입니다.',
    conditionGrade: '1',
    reviewStatus: 'approved',
    operationType: 'lodging',
    maxCapacity: 4,
    priceRange: '80,000원대',
    tags: ['한옥', '소백산', '가족형'],
    isApproved: true,
    registeredAt: '2026-04-01',
    approvedAt: '2026-04-08',
  },
  {
    id: 'house-002',
    name: '부석면 고택 감성 체험가옥',
    districtId: 'buseok',
    districtName: '부석면',
    address: '부석면 문화마을 인근',
    description: '부석사 관광 동선과 연결되는 조용한 마을형 빈집으로 체험 프로그램 운영에 적합합니다.',
    conditionGrade: '1',
    reviewStatus: 'approved',
    operationType: 'experience',
    maxCapacity: 6,
    priceRange: '110,000원대',
    tags: ['부석사', '체험', '마당'],
    isApproved: true,
    registeredAt: '2026-03-26',
    approvedAt: '2026-04-04',
  },
  {
    id: 'house-003',
    name: '순흥면 장기체류형 농가주택',
    districtId: 'sunheung',
    districtName: '순흥면',
    address: '순흥면 선비촌 생활권',
    description: '주방과 방 구조가 분리되어 장기체류자에게 적합하며 기본 보수만으로 운영이 가능합니다.',
    conditionGrade: '2',
    reviewStatus: 'approved',
    operationType: 'longterm',
    maxCapacity: 3,
    priceRange: '60,000원대',
    tags: ['장기체류', '선비촌', '조용함'],
    isApproved: true,
    registeredAt: '2026-03-12',
    approvedAt: '2026-03-22',
  },
  {
    id: 'house-004',
    name: '가흥동 도시근교 소형주택',
    districtId: 'gaheung',
    districtName: '가흥동',
    address: '가흥동 생활권',
    description: '시내 접근성이 좋고 소규모 보수 후 단기 체류나 업무형 숙박으로 활용할 수 있습니다.',
    conditionGrade: '2',
    reviewStatus: 'approved',
    operationType: 'lodging',
    maxCapacity: 2,
    priceRange: '50,000원대',
    tags: ['도심권', '소형', '교통'],
    isApproved: true,
    registeredAt: '2026-03-02',
    approvedAt: '2026-03-15',
  },
  {
    id: 'house-005',
    name: '문수면 숲길 옆 농가',
    districtId: 'munsu',
    districtName: '문수면',
    address: '문수면 숲길 인근',
    description: '자연 경관이 좋지만 내부 보수가 일부 필요해 추가 검토 후 운영 유형을 확정할 예정입니다.',
    conditionGrade: '3',
    reviewStatus: 'pending',
    operationType: 'review_needed',
    maxCapacity: 5,
    priceRange: '검토 중',
    tags: ['숲길', '보수필요', '농가'],
    isApproved: false,
    registeredAt: '2026-04-12',
    approvedAt: null,
  },
];

// ============================================================
// 빈집 등록 신청 데모 데이터
// ============================================================
const REGISTRATION_REQUESTS = [
  {
    id: 'req-001',
    ownerName: '김영수',
    ownerContact: '010-1000-2000',
    ownerType: '개인',
    districtId: 'punggi',
    districtName: '풍기읍',
    address: '풍기읍 산책로 일대',
    buildingType: 'hanok',
    buildingCondition: '양호',
    usageTypes: ['숙박 공간'],
    vacantYears: '1~3년',
    description: '마당이 있고 지붕 보수는 완료되어 있습니다.',
    reviewStatus: 'approved',
    submittedAt: '2026-04-01',
    reviewComment: '공개 승인 가능',
  },
  {
    id: 'req-002',
    ownerName: '박민정',
    ownerContact: '010-2222-3030',
    ownerType: '개인',
    districtId: 'buseok',
    districtName: '부석면',
    address: '부석면 문화마을 인근',
    buildingType: 'farmhouse',
    buildingCondition: '소규모 보수 필요',
    usageTypes: ['체험 공간', '커뮤니티 공간'],
    vacantYears: '3~5년',
    description: '마을 프로그램 연계 가능성이 높습니다.',
    reviewStatus: 'under_review',
    submittedAt: '2026-04-10',
  },
  {
    id: 'req-003',
    ownerName: '이준호',
    ownerContact: '010-3333-4040',
    ownerType: '개인',
    districtId: 'sunheung',
    districtName: '순흥면',
    address: '순흥면 선비촌 생활권',
    buildingType: 'modern',
    buildingCondition: '양호',
    usageTypes: ['장기체류 공간'],
    vacantYears: '1년 미만',
    description: '주차 공간과 독립 출입구가 있습니다.',
    reviewStatus: 'site_visit',
    submittedAt: '2026-04-14',
  },
  {
    id: 'req-004',
    ownerName: '최서연',
    ownerContact: '010-4444-5050',
    ownerType: '법인',
    districtId: 'munsu',
    districtName: '문수면',
    address: '문수면 숲길 인근',
    buildingType: 'farmhouse',
    buildingCondition: '대규모 보수 필요',
    usageTypes: ['숙박 공간'],
    vacantYears: '5~10년',
    description: '지붕과 내부 전기 점검이 필요합니다.',
    reviewStatus: 'submitted',
    submittedAt: '2026-04-18',
  },
];

const DISTRICT_STATISTICS = YEONGJU_DISTRICTS.map((district, index) => {
  const requests = REGISTRATION_REQUESTS.filter(request => request.districtId === district.id);
  const houses = VACANT_HOUSE_LIST.filter(house => house.districtId === district.id);
  return {
    districtId: district.id,
    districtName: district.name,
    total: Math.max(requests.length, index < 6 ? 2 : 1),
    approved: houses.filter(house => house.isApproved).length + (index % 3 === 0 ? 1 : 0),
    pending: requests.filter(request => ['submitted', 'under_review', 'site_visit'].includes(request.reviewStatus)).length,
    rejected: requests.filter(request => request.reviewStatus === 'rejected').length,
  };
});

const VENDOR_LIST = [
  {
    id: 'vendor-001',
    name: '소백공간 리모델링',
    type: 'construction',
    typeLabel: '건축·리모델링',
    description: '노후 농가주택 보수와 소규모 숙박 공간 전환 경험이 많은 영주시 협력업체입니다.',
    tags: ['지붕 보수', '단열', '숙박 전환'],
    rating: 4.8,
    completedProjects: 64,
    phone: '054-000-1100',
  },
  {
    id: 'vendor-002',
    name: '영주 클린케어',
    type: 'operation',
    typeLabel: '운영·관리',
    description: '빈집 청소, 정리, 정기 점검, 체크인 운영 지원을 담당하는 지역 관리 업체입니다.',
    tags: ['청소', '정기관리', '체크인'],
    rating: 4.7,
    completedProjects: 52,
    phone: '054-000-2200',
  },
  {
    id: 'vendor-003',
    name: '선비촌 인테리어',
    type: 'interior',
    typeLabel: '인테리어',
    description: '한옥과 농가 감성을 유지하면서 안전성과 편의성을 높이는 공간 개선을 지원합니다.',
    tags: ['한옥 감성', '가구', '조명'],
    rating: 4.6,
    completedProjects: 31,
    phone: '054-000-3300',
  },
];

const BOOKING_REQUESTS = [];
const WISHLIST_HOUSES = [];
const SUMMARY_STATISTICS = {
  registeredHouses: 595,
  approvedHouses: 380,
  districtCoverage: YEONGJU_DISTRICTS.length,
  vendors: VENDOR_LIST.length,
};


// ============================================================
// 데이터 내보내기 (추후 모듈화 시 사용)
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YEONGJU_DISTRICTS,
    CONDITION_GRADES,
    REVIEW_STATUS,
    OPERATION_TYPES,
    VACANT_HOUSE_LIST,
    DISTRICT_STATISTICS,
    REGISTRATION_REQUESTS,
    VENDOR_LIST,
    BOOKING_REQUESTS,
    WISHLIST_HOUSES,
    SUMMARY_STATISTICS,
  };
}
