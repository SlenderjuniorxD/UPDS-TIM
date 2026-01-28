import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvaluatorDashboard } from './dashboard';

describe('Dashboard', () => {
  let component: EvaluatorDashboard ;
  let fixture: ComponentFixture<EvaluatorDashboard >;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvaluatorDashboard ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvaluatorDashboard );
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
